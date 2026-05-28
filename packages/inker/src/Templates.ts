import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { InkerRenderError } from "./InkerRenderError.js";
import {
	PROTOTYPE_POLLUTION_KEYS,
	RESERVED_BINDING_NAMES,
} from "./identifierGuards.js";
import { lex } from "./lex.js";
import {
	type InkerNode,
	parse,
	type SlotNode,
	type TemplateAst,
} from "./parse.js";
import { type HelperFn, renderAst } from "./render.js";

export type CacheMode = "auto" | "mtime" | "never";

export interface TemplatesOptions {
	root: string;
	cacheMode?: CacheMode;
	helpers?: ReadonlyMap<string, HelperFn>;
}

const HELPER_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// P13 — Windows-reserved device basenames. Refused on every platform for
// portability: a template named `con.inker` would resolve to the Windows
// console device handle, not a file.
const WINDOWS_RESERVED: ReadonlySet<string> = new Set([
	"con",
	"prn",
	"aux",
	"nul",
	"com1",
	"com2",
	"com3",
	"com4",
	"com5",
	"com6",
	"com7",
	"com8",
	"com9",
	"lpt1",
	"lpt2",
	"lpt3",
	"lpt4",
	"lpt5",
	"lpt6",
	"lpt7",
	"lpt8",
	"lpt9",
]);

interface CacheEntry {
	ast: TemplateAst;
	mtimeMs: number;
}

interface ComposedTemplate {
	bodyAst: TemplateAst;
	layoutAst?: TemplateAst;
	layoutName?: string;
	layoutAbsPath?: string;
	partialAsts: Map<string, TemplateAst>;
	componentAsts: Map<string, TemplateAst>;
}

const VALID_CACHE_MODES: ReadonlySet<string> = new Set([
	"auto",
	"mtime",
	"never",
]);

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
	return (
		value instanceof Error && typeof Reflect.get(value, "code") === "string"
	);
}

function normalizePartialKey(name: string): string {
	let key = name;
	while (key.startsWith("./")) key = key.slice(2);
	// T2: refuse an empty key — `{% include './' %}` would otherwise collide
	// with the synthetic `<root>/.inker` dotfile path and silently include
	// (or misreport) an unrelated file. validateName lets a literal `./`
	// through (no `..`, no NUL, no backslash, length > 0), so the assertion
	// must live here.
	if (key.length === 0) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Partial/component name resolves to an empty key; got ${JSON.stringify(name)}`,
			{ templateName: name },
		);
	}
	return key;
}

function validateName(name: unknown): string {
	if (typeof name !== "string" || name.length === 0) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template name must be a non-empty string; got ${JSON.stringify(name)}`,
			{ templateName: typeof name === "string" ? name : undefined },
		);
	}
	if (name.includes("\0")) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			"Template name contains a NUL byte",
			{ templateName: name },
		);
	}
	// T8: reject other control bytes (CR/LF/TAB/ESC etc.), lone surrogates,
	// and BOM in template names. These pass through filesystems differently
	// across platforms (ext4 vs NTFS) and amplify ANSI-escape injection into
	// error/log messages that interpolate `templatePath`.
	for (let i = 0; i < name.length; i += 1) {
		const code = name.charCodeAt(i);
		// C0 controls (0x00 caught above), DEL, C1 controls
		if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Template name contains a control character (0x${code.toString(16).padStart(2, "0")}) at offset ${i}; got ${JSON.stringify(name)}`,
				{ templateName: name },
			);
		}
		// BOM
		if (code === 0xfeff) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Template name contains a BOM (U+FEFF) at offset ${i}`,
				{ templateName: name },
			);
		}
		// Lone surrogates (UTF-16 high half without paired low half, or vice
		// versa) corrupt downstream JSON serialisation of error context.
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = name.charCodeAt(i + 1);
			if (!(next >= 0xdc00 && next <= 0xdfff)) {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Template name contains a lone high surrogate at offset ${i}`,
					{ templateName: name },
				);
			}
			i += 1;
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Template name contains a lone low surrogate at offset ${i}`,
				{ templateName: name },
			);
		}
	}
	if (path.isAbsolute(name)) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template name must be relative to the templates root; got absolute path ${JSON.stringify(name)}`,
			{ templateName: name },
		);
	}
	if (name.split(/[/\\]/).some((segment) => segment === "..")) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template name cannot contain '..' segments; got ${JSON.stringify(name)}`,
			{ templateName: name },
		);
	}
	if (name.includes("\\")) {
		// Align with parseBlockTag.validatePathName: backslashes are forbidden
		// regardless of platform — a Windows-only escape vector is silent
		// inconsistency, not a portability feature.
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template name cannot contain backslashes (use forward slash only); got ${JSON.stringify(name)}`,
			{ templateName: name },
		);
	}
	// P5: reject Windows drive-letter prefixes (`C:foo`) which would be
	// interpreted as drive-relative on Windows and bypass the lexical
	// `path.join(root, …)` containment lower down. parseBlockTag.validatePathName
	// rejects these for `{% include %}`; mirror the rule on the public
	// Templates#render entrypoint so the two surfaces agree.
	if (/^[A-Za-z]:/.test(name)) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template name cannot start with a Windows drive-letter prefix; got ${JSON.stringify(name)}`,
			{ templateName: name },
		);
	}
	// P13: refuse Windows-reserved basenames (`con`, `prn`, `aux`, `nul`,
	// `com1`-`com9`, `lpt1`-`lpt9`). These resolve to device handles on
	// Windows and throw opaque non-Inker errors. Refuse on all platforms
	// for cross-platform consistency — a template that works on Linux
	// shouldn't fail mysteriously on Windows just because of its filename.
	for (const segment of name.split("/")) {
		const base = segment.replace(/\.[^.]*$/, "").toLowerCase();
		if (WINDOWS_RESERVED.has(base)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Template name segment '${segment}' is a Windows-reserved device name`,
				{ templateName: name },
			);
		}
	}
	return name;
}

function assertContained(root: string, absPath: string, name: string): void {
	// P12: case-sensitive `startsWith` breaks on APFS/HFS+/NTFS where
	// `realpath` canonicalises segment casing — a root like
	// `/Users/x/Templates` whose realpath returns `/users/x/templates`
	// would fail every legitimate lookup. Switch to `path.relative`:
	// when the target is under root, the relative path neither starts
	// with `..` nor is absolute (Windows cross-drive case).
	const normalised = path.resolve(absPath);
	const rel = path.relative(root, normalised);
	if (rel === "") return; // identical path
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Resolved template path escapes the templates root: ${normalised} is outside ${root}`,
			{ templatePath: normalised, templateName: name },
		);
	}
}

function wrapFsError(
	cause: unknown,
	absPath: string,
	name: string,
): InkerRenderError {
	if (isErrnoException(cause) && cause.code === "ENOENT") {
		return new InkerRenderError(
			"E_INKER_TEMPLATE_NOT_FOUND",
			`Template not found: ${absPath}`,
			{ templatePath: absPath, templateName: name },
			{ cause },
		);
	}
	if (isErrnoException(cause)) {
		// EACCES / EISDIR / ELOOP / ENOTDIR — file exists but the path does
		// not resolve to a readable regular file. Path-axis error, not
		// missing-template.
		return new InkerRenderError(
			"E_INKER_INVALID_PATH",
			`Template path is not a readable file (${cause.code}): ${absPath}`,
			{ templatePath: absPath, templateName: name },
			{ cause },
		);
	}
	// Non-Errno failure (e.g. unexpected runtime error during stat/read) —
	// don't lie about "template not found" since the file may well exist;
	// surface as a generic path-axis failure with the underlying message.
	const detail = cause instanceof Error ? cause.message : String(cause);
	return new InkerRenderError(
		"E_INKER_INVALID_PATH",
		`Failed to load template ${absPath}: ${detail}`,
		{ templatePath: absPath, templateName: name },
		{ cause },
	);
}

function isWhitespaceOnlyText(node: InkerNode): boolean {
	if (node.kind !== "Text") return false;
	for (let i = 0; i < node.value.length; i += 1) {
		const c = node.value[i];
		if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
			return false;
		}
	}
	return true;
}

function bodyHasContent(bodyAst: TemplateAst): boolean {
	for (const node of bodyAst.nodes) {
		if (node.kind === "Text") {
			if (!isWhitespaceOnlyText(node)) return true;
			continue;
		}
		// Any non-Text node (Interpolation/Partial/Component/If/Each/Slot…)
		// counts as content; an empty If/Each at the top level is still an
		// authoring statement that needs a body slot in the layout.
		return true;
	}
	return false;
}

type DiskNodeKind = "Layout" | "Partial" | "Slot" | "Component";

function findFirstDiskNodeIn(
	nodes: readonly InkerNode[],
): { kind: DiskNodeKind; name: string } | undefined {
	for (const node of nodes) {
		// T10: exhaustive switch with `_exhaust: never` so a future InkerNode
		// kind that this function fails to handle becomes a TS compile error
		// instead of silently slipping past the disk-required walk. Same
		// pattern should land in the other findFirst*/collect* functions on
		// the next pass.
		switch (node.kind) {
			case "Layout":
			case "Partial":
			case "Slot":
			case "Component":
				return { kind: node.kind, name: node.name };
			case "If": {
				const inThen = findFirstDiskNodeIn(node.thenNodes);
				if (inThen !== undefined) return inThen;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstDiskNodeIn(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Each": {
				const inBody = findFirstDiskNodeIn(node.bodyNodes);
				if (inBody !== undefined) return inBody;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstDiskNodeIn(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in findFirstDiskNodeIn: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
	return undefined;
}

function findFirstDiskNode(
	ast: TemplateAst,
): { kind: DiskNodeKind; name: string } | undefined {
	return findFirstDiskNodeIn(ast.nodes);
}

function findFirstSlotInNodes(
	nodes: readonly InkerNode[],
): SlotNode | undefined {
	for (const node of nodes) {
		// P18: exhaustive switch so future kinds added to InkerNode become
		// a TS compile error here instead of silently skipping the walk.
		switch (node.kind) {
			case "Slot":
				return node;
			case "If": {
				const inThen = findFirstSlotInNodes(node.thenNodes);
				if (inThen !== undefined) return inThen;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstSlotInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Each": {
				const inBody = findFirstSlotInNodes(node.bodyNodes);
				if (inBody !== undefined) return inBody;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstSlotInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Layout":
			case "Partial":
			case "Component":
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in findFirstSlotInNodes: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
	return undefined;
}

function findFirstSlotIn(ast: TemplateAst): SlotNode | undefined {
	return findFirstSlotInNodes(ast.nodes);
}

function hasBodySlotInNodes(nodes: readonly InkerNode[]): boolean {
	for (const node of nodes) {
		// P18: exhaustive switch.
		switch (node.kind) {
			case "Slot":
				if (node.name === "body") return true;
				break;
			case "If": {
				if (hasBodySlotInNodes(node.thenNodes)) return true;
				if (
					node.elseNodes !== undefined &&
					hasBodySlotInNodes(node.elseNodes)
				) {
					return true;
				}
				break;
			}
			case "Each": {
				if (hasBodySlotInNodes(node.bodyNodes)) return true;
				if (
					node.elseNodes !== undefined &&
					hasBodySlotInNodes(node.elseNodes)
				) {
					return true;
				}
				break;
			}
			case "Layout":
			case "Partial":
			case "Component":
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in hasBodySlotInNodes: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
	return false;
}

function findFirstLayoutInNodes(
	nodes: readonly InkerNode[],
): { line: number; column: number } | undefined {
	for (const node of nodes) {
		// P18: exhaustive switch.
		switch (node.kind) {
			case "Layout":
				return { line: node.line, column: node.column };
			case "If": {
				const inThen = findFirstLayoutInNodes(node.thenNodes);
				if (inThen !== undefined) return inThen;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstLayoutInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Each": {
				const inBody = findFirstLayoutInNodes(node.bodyNodes);
				if (inBody !== undefined) return inBody;
				if (node.elseNodes !== undefined) {
					const inElse = findFirstLayoutInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
				break;
			}
			case "Slot":
			case "Partial":
			case "Component":
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in findFirstLayoutInNodes: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
	return undefined;
}

function collectComponentNodesInNodes(
	nodes: readonly InkerNode[],
	out: Array<{ name: string; line: number; column: number }>,
): void {
	for (const node of nodes) {
		// P18: exhaustive switch.
		switch (node.kind) {
			case "Component":
				out.push({ name: node.name, line: node.line, column: node.column });
				break;
			case "If":
				collectComponentNodesInNodes(node.thenNodes, out);
				if (node.elseNodes !== undefined) {
					collectComponentNodesInNodes(node.elseNodes, out);
				}
				break;
			case "Each":
				collectComponentNodesInNodes(node.bodyNodes, out);
				if (node.elseNodes !== undefined) {
					collectComponentNodesInNodes(node.elseNodes, out);
				}
				break;
			case "Layout":
			case "Partial":
			case "Slot":
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in collectComponentNodesInNodes: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
}

function collectPartialNodesInNodes(
	nodes: readonly InkerNode[],
	out: Array<{ name: string; line: number; column: number }>,
): void {
	for (const node of nodes) {
		// P18: exhaustive switch.
		switch (node.kind) {
			case "Partial":
				out.push({ name: node.name, line: node.line, column: node.column });
				break;
			case "If":
				collectPartialNodesInNodes(node.thenNodes, out);
				if (node.elseNodes !== undefined) {
					collectPartialNodesInNodes(node.elseNodes, out);
				}
				break;
			case "Each":
				collectPartialNodesInNodes(node.bodyNodes, out);
				if (node.elseNodes !== undefined) {
					collectPartialNodesInNodes(node.elseNodes, out);
				}
				break;
			case "Layout":
			case "Component":
			case "Slot":
			case "Text":
			case "Interpolation":
				break;
			default: {
				const _exhaust: never = node;
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unhandled node kind in collectPartialNodesInNodes: ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}
}

export class Templates {
	readonly #root: string;
	readonly #cacheMode: "mtime" | "never";
	readonly #cache: Map<string, CacheEntry> = new Map();
	readonly #inflight: Map<string, Promise<TemplateAst>> = new Map();
	// T7: monotonic counter bumped by clearCache(). #loadAstUncached snapshots
	// it before doing async I/O and refuses to write back to the cache if the
	// generation moved during the load — prevents a pre-clear in-flight load
	// from silently re-populating the cache after clearCache() ran.
	#cacheGeneration = 0;
	readonly #helpers: ReadonlyMap<string, HelperFn>;
	readonly #helperNames: ReadonlySet<string>;

	constructor(options: TemplatesOptions) {
		const root = options.root;

		if (typeof root !== "string" || !path.isAbsolute(root)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates root must be an absolute path; got ${JSON.stringify(root)}`,
				{ templatePath: typeof root === "string" ? root : undefined },
			);
		}

		// D3: refuse filesystem-root / drive-root values. With root = "/" on
		// POSIX or "C:\" on Windows, assertContained's `startsWith(rootWithSep)`
		// matches every absolute path and the symlink-containment guard
		// degenerates to "anywhere on the volume". Operator misconfiguration —
		// fail loudly at construction rather than serve traversal as a feature.
		if (root === "/" || /^[A-Za-z]:[\\/]?$/.test(root)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates root cannot be the filesystem/drive root; got ${JSON.stringify(root)}`,
				{ templatePath: root },
			);
		}

		let stat: fs.Stats;
		try {
			stat = fs.statSync(root);
		} catch (cause) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates root does not exist: ${root}`,
				{ templatePath: root },
				{ cause },
			);
		}

		if (!stat.isDirectory()) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates root is not a directory: ${root}`,
				{ templatePath: root },
			);
		}

		// Canonicalize root via realpath so symlinked-target containment checks
		// compare canonical-against-canonical paths in #loadAst.
		// P6: realpath failure here is a hard error — `statSync(root)` succeeded
		// two lines up, so realpath should not fail. Silently falling back to
		// the un-canonical root caused the realpath containment check in
		// #loadAst to compare a real-path against a possibly-symlinked root,
		// producing false positives (legitimate templates rejected) for every
		// caller — broken Inker without diagnostic.
		try {
			this.#root = fs.realpathSync(root);
		} catch (cause) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates root could not be canonicalised (realpath failed) although it exists: ${root}`,
				{ templatePath: root },
				{ cause },
			);
		}

		const requested = options.cacheMode ?? "auto";
		if (!VALID_CACHE_MODES.has(requested)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates cacheMode must be one of 'auto' | 'mtime' | 'never'; got ${JSON.stringify(requested)}`,
			);
		}
		if (requested === "auto") {
			this.#cacheMode =
				process.env.NODE_ENV === "production" ? "never" : "mtime";
		} else {
			this.#cacheMode = requested;
		}

		const helpers = options.helpers ?? new Map<string, HelperFn>();
		// P12 — validate the helpers container is actually a Map. The TS type
		// promises ReadonlyMap, but a caller in plain JS (or via a typed
		// bypass) could pass a plain object and hit a confusing
		// "helpers.keys is not a function" at construction.
		if (!(helpers instanceof Map)) {
			throw new InkerRenderError(
				"E_INKER_INVALID_PATH",
				`Templates.helpers must be a Map; got ${Object.prototype.toString.call(helpers).slice(8, -1)}`,
			);
		}
		const helperNames = new Set<string>();
		for (const [key, value] of helpers) {
			// T3: validate the key is a string BEFORE handing it to
			// HELPER_NAME_RE.test(), which ToString-coerces and throws a raw
			// TypeError for Symbol keys — leaking outside the typed-error
			// contract. Map allows any key type at runtime; only strings make
			// sense as helper names.
			if (typeof key !== "string") {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Helper name must be a string; got ${typeof key}`,
				);
			}
			// P13 — validate each helper value is callable. Without this, a
			// non-function would surface as a generic TypeError wrapped under
			// E_INKER_HELPER_THROW at render-time, hiding the registration bug.
			if (typeof value !== "function") {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Helper '${key}' must be a function; got ${typeof value}`,
					{ templateName: key },
				);
			}
			if (!HELPER_NAME_RE.test(key)) {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Helper name '${key}' is not a valid identifier (must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/)`,
					{ templateName: key },
				);
			}
			if (RESERVED_BINDING_NAMES.has(key)) {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Helper name '${key}' is a reserved word`,
					{ templateName: key },
				);
			}
			if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
				throw new InkerRenderError(
					"E_INKER_INVALID_PATH",
					`Helper name '${key}' is forbidden (prototype-pollution surface)`,
					{ templateName: key },
				);
			}
			helperNames.add(key);
		}
		// P14 reverted: `Templates#helpers` is intentionally a LIVE reference,
		// documented by the `resolves helper implementation LIVE per call (D4)`
		// regression test. Edge-case-hunter flagged this as a desync risk vs
		// `#helperNames` (frozen at ctor time), but the contract is: parse-time
		// validation is fixed to the helper SET registered at ctor; the
		// implementation behind each name can be swapped at runtime by the
		// caller (used for hot-swap of catalogue overrides). Defensive copy
		// would break that contract.
		this.#helpers = helpers;
		this.#helperNames = helperNames;
	}

	async render(
		name: string,
		data: Readonly<Record<string, unknown>>,
	): Promise<string> {
		const validated = validateName(name);
		const absPath = path.join(this.#root, `${validated}.inker`);
		assertContained(this.#root, absPath, validated);

		const entryAst = await this.#loadAst(absPath, validated);
		const composed = await this.#compose(
			entryAst,
			validated,
			absPath,
			new Set([absPath]),
		);

		const bodyHtml = renderAst(composed.bodyAst, data, {
			templatePath: absPath,
			templateName: validated,
			partialAsts: composed.partialAsts,
			componentAsts: composed.componentAsts,
			helpers: this.#helpers,
		});

		if (composed.layoutAst === undefined) {
			return bodyHtml;
		}

		return renderAst(composed.layoutAst, data, {
			templatePath: composed.layoutAbsPath ?? absPath,
			templateName: composed.layoutName ?? validated,
			partialAsts: composed.partialAsts,
			componentAsts: composed.componentAsts,
			helpers: this.#helpers,
			bodyHtml,
		});
	}

	renderString(
		source: string,
		data: Readonly<Record<string, unknown>>,
	): string {
		// T4 + P15: strip ALL U+FEFF (BOM) characters, not just a leading one.
		// `validateName` already refuses BOM in any position of a template
		// name; source built by concatenating multiple BOM-prefixed fragments
		// can leak interior BOMs into rendered HTML and confuse downstream
		// parsers. Keep symmetry with #loadAstUncached on the leading case
		// while extending coverage to internal occurrences.
		const normalisedSource = source.includes("﻿")
			? source.replace(/﻿/g, "")
			: source;
		const tokens = lex(normalisedSource);
		const ast = parse(tokens, { helpers: this.#helperNames });

		const diskNode = findFirstDiskNode(ast);
		if (diskNode !== undefined) {
			if (diskNode.kind === "Layout") {
				throw new InkerRenderError(
					"E_INKER_DISK_REQUIRED",
					`Templates#renderString cannot resolve {% layout '${diskNode.name}' %} — use Templates#render(name, data) instead`,
				);
			}
			if (diskNode.kind === "Partial") {
				throw new InkerRenderError(
					"E_INKER_DISK_REQUIRED",
					`Templates#renderString cannot resolve {% include '${diskNode.name}' %} — use Templates#render(name, data) instead`,
				);
			}
			if (diskNode.kind === "Component") {
				throw new InkerRenderError(
					"E_INKER_DISK_REQUIRED",
					`Templates#renderString cannot resolve {% component '${diskNode.name}' %} — use Templates#render(name, data) instead`,
				);
			}
			throw new InkerRenderError(
				"E_INKER_DISK_REQUIRED",
				`Templates#renderString cannot use {{> ${diskNode.name} }} outside of a layout — the slot has no parent layout to inject into`,
			);
		}

		return renderAst(ast, data, { helpers: this.#helpers });
	}

	clearCache(): void {
		this.#cacheGeneration += 1;
		this.#cache.clear();
		// T7: also drop the in-flight promise dedup map so the next render()
		// for any in-flight key forces a fresh load instead of reusing the
		// pre-clear promise. The promise itself still resolves for whoever
		// awaited it (and may write its stale AST to the cache); the
		// #cacheGeneration counter discards that write — see #loadAstUncached.
		this.#inflight.clear();
	}

	async #loadAst(absPath: string, validatedName: string): Promise<TemplateAst> {
		const inflight = this.#inflight.get(absPath);
		if (inflight !== undefined) return inflight;

		const promise = this.#loadAstUncached(absPath, validatedName);
		this.#inflight.set(absPath, promise);
		try {
			return await promise;
		} finally {
			this.#inflight.delete(absPath);
		}
	}

	async #loadAstUncached(
		absPath: string,
		validatedName: string,
	): Promise<TemplateAst> {
		// T7: snapshot the cache generation. If clearCache() runs while this
		// load is in flight, the snapshot will diverge from #cacheGeneration
		// at write-back time, and we'll skip the cache.set() to avoid
		// silently restoring a stale AST after operator invalidation.
		const loadGeneration = this.#cacheGeneration;
		const cached = this.#cache.get(absPath);

		if (this.#cacheMode === "never" && cached !== undefined) {
			return cached.ast;
		}

		let currentMtime = 0;
		if (this.#cacheMode === "mtime") {
			try {
				currentMtime = (await fsPromises.stat(absPath)).mtimeMs;
			} catch (cause) {
				throw wrapFsError(cause, absPath, validatedName);
			}
			// D1: treat mtime === 0 as "no timestamp available" rather than a
			// real value. Some FUSE filesystems, tar restores, and certain
			// network mounts surface mtimeMs: 0 as a sentinel. If we treated
			// that as a cacheable timestamp, the FIRST load would cache, and
			// every subsequent disk edit would also report mtimeMs: 0 → cache
			// hit → permanent silent staleness. Force a re-parse instead.
			// Cerebrum DNR #61 forbids size/hash checks; this preserves the
			// mtime-only spirit while handling the sentinel safely.
			if (
				currentMtime !== 0 &&
				cached !== undefined &&
				cached.mtimeMs === currentMtime
			) {
				return cached.ast;
			}
		}

		// T6 + P1: open the file with `O_NOFOLLOW` first, then validate the
		// canonical path against root, then read from the file handle. Previous
		// approach did two separate awaits on `absPath` (`realpath` then
		// `readFile`) — an attacker who swaps `absPath` for a symlink between
		// the two awaits would bypass the containment check and have the
		// content read follow the swapped link. Holding a FD pins the inode:
		// after `open` succeeds, subsequent path swaps cannot redirect the
		// read. `O_NOFOLLOW` additionally rejects the final segment being a
		// symlink at open time. The `realpath` check after open still races on
		// intermediate directory swaps but is now belt-and-suspenders rather
		// than the only line of defence.
		let handle: fsPromises.FileHandle;
		try {
			handle = await fsPromises.open(
				absPath,
				fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
			);
		} catch (cause) {
			throw wrapFsError(cause, absPath, validatedName);
		}
		let source: string;
		try {
			let realPath: string;
			try {
				realPath = await fsPromises.realpath(absPath);
			} catch (cause) {
				throw wrapFsError(cause, absPath, validatedName);
			}
			if (realPath !== absPath) {
				const rel = path.relative(this.#root, realPath);
				if (rel !== "" && (rel.startsWith("..") || path.isAbsolute(rel))) {
					throw new InkerRenderError(
						"E_INKER_INVALID_PATH",
						`Resolved template path escapes the templates root via symlink: ${realPath} is outside ${this.#root}`,
						{ templatePath: realPath, templateName: validatedName },
					);
				}
			}
			try {
				source = await handle.readFile("utf8");
			} catch (cause) {
				throw wrapFsError(cause, absPath, validatedName);
			}
		} finally {
			await handle.close();
		}

		// T4: strip leading UTF-8 BOM if present. Windows editors (Notepad)
		// commonly insert it; lex sees it as a Text token, defeating the
		// "first non-stripped node must be Layout" composition rule and
		// silently treating `{% layout %}` as body content.
		if (source.charCodeAt(0) === 0xfeff) {
			source = source.slice(1);
		}

		const tokens = lex(source, { templatePath: absPath });
		const ast = parse(tokens, {
			templatePath: absPath,
			helpers: this.#helperNames,
		});

		// T7: only populate the cache if the generation is unchanged. If
		// clearCache() was called during the await chain above, the new
		// generation discards this write — the next render() starts fresh.
		if (this.#cacheGeneration === loadGeneration) {
			this.#cache.set(absPath, { ast, mtimeMs: currentMtime });
		}
		return ast;
	}

	async #compose(
		entryAst: TemplateAst,
		entryName: string,
		entryAbsPath: string,
		includeStack: Set<string>,
	): Promise<ComposedTemplate> {
		const partialAsts = new Map<string, TemplateAst>();
		const componentAsts = new Map<string, TemplateAst>();

		// 1. Locate the optional Layout (must be first non-stripped node).
		const firstNode = entryAst.nodes[0];
		const hasLayout = firstNode !== undefined && firstNode.kind === "Layout";

		// 2. Build the body AST by stripping the LayoutNode.
		const bodyNodes: InkerNode[] = hasLayout
			? entryAst.nodes.slice(1)
			: entryAst.nodes.slice();
		const bodyAst: TemplateAst = Object.freeze({
			nodes: Object.freeze(bodyNodes),
		});

		// Body ASTs must not contain Slot nodes: slots only have meaning in a
		// layout-yield context. A `{{> body }}` in the body itself silently
		// rendered empty before this check.
		const bodySlot = findFirstSlotIn(bodyAst);
		if (bodySlot !== undefined) {
			throw new InkerRenderError(
				"E_INKER_UNKNOWN_SLOT",
				`{{> ${bodySlot.name} }} outside of a layout — slot placeholders are only valid inside layout files (got at line ${bodySlot.line}, column ${bodySlot.column} in '${entryName}')`,
				{
					templatePath: entryAbsPath,
					templateName: entryName,
					line: bodySlot.line,
					column: bodySlot.column,
				},
			);
		}

		// T5: also reject any further {% layout %} directive in the body.
		// The slice(1) above strips only the leading Layout; a duplicate
		// `{% layout 'main' %}` later in the file (or inside an if/each)
		// would otherwise silently no-op since `findFirstLayoutInNodes` was
		// previously only invoked on layout ASTs.
		const dupLayout = findFirstLayoutInNodes(bodyAst.nodes);
		if (dupLayout !== undefined) {
			throw new InkerRenderError(
				"E_INKER_DUPLICATE_LAYOUT",
				`{% layout %} can only appear once and must be the first directive (duplicate at line ${dupLayout.line}, column ${dupLayout.column} in '${entryName}')`,
				{
					templatePath: entryAbsPath,
					templateName: entryName,
					line: dupLayout.line,
					column: dupLayout.column,
				},
			);
		}

		// 3. Resolve all PartialNodes reachable from the body AST.
		await this.#resolvePartialsIn(
			bodyAst,
			partialAsts,
			includeStack,
			entryAbsPath,
		);

		// 3b. Partial ASTs may not contain Slot nodes either.
		for (const [partialName, partialAst] of partialAsts) {
			const slot = findFirstSlotIn(partialAst);
			if (slot !== undefined) {
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_SLOT",
					`Partial '${partialName}' contains {{> ${slot.name} }} — slot placeholders are only valid inside layout files (line ${slot.line}, column ${slot.column})`,
					{
						templateName: partialName,
						line: slot.line,
						column: slot.column,
					},
				);
			}
		}

		// 3c. Resolve all ComponentNodes reachable from the body AST.
		await this.#resolveComponentsIn(
			bodyAst.nodes,
			componentAsts,
			includeStack,
			entryAbsPath,
		);

		if (!hasLayout) {
			// 3d. Resolve components transitively reachable from partials.
			for (const partialAst of partialAsts.values()) {
				await this.#resolveComponentsIn(
					partialAst.nodes,
					componentAsts,
					includeStack,
					entryAbsPath,
				);
			}
			return { bodyAst, partialAsts, componentAsts };
		}

		// 4. Resolve the layout file.
		const layoutNode = firstNode;
		const layoutValidated = validateName(layoutNode.name);
		const layoutAbsPath = path.join(this.#root, `${layoutValidated}.inker`);
		assertContained(this.#root, layoutAbsPath, layoutValidated);

		if (includeStack.has(layoutAbsPath)) {
			throw new InkerRenderError(
				"E_INKER_CIRCULAR_INCLUDE",
				`Circular include: ${this.#cycleString(includeStack, layoutAbsPath)} (started at ${entryAbsPath})`,
				{
					templatePath: layoutAbsPath,
					templateName: layoutValidated,
					line: layoutNode.line,
					column: layoutNode.column,
				},
			);
		}

		includeStack.add(layoutAbsPath);
		let layoutAst: TemplateAst;
		try {
			layoutAst = await this.#loadAst(layoutAbsPath, layoutValidated);
		} catch (e) {
			includeStack.delete(layoutAbsPath);
			throw e;
		}

		try {
			// 5. Nested-layout rejection (recursive walk through If/Each branches too).
			const nestedLayout = findFirstLayoutInNodes(layoutAst.nodes);
			if (nestedLayout !== undefined) {
				throw new InkerRenderError(
					"E_INKER_NESTED_LAYOUT_UNSUPPORTED",
					`Layout file '${layoutValidated}' itself contains {% layout %} — nested layouts are not supported`,
					{
						templatePath: layoutAbsPath,
						templateName: layoutValidated,
						line: nestedLayout.line,
						column: nestedLayout.column,
					},
				);
			}

			// 6. Unknown-slot rejection (parse-time-of-layout semantic).
			const unknownSlot = this.#findUnknownSlot(layoutAst);
			if (unknownSlot !== undefined) {
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_SLOT",
					`Unknown slot '${unknownSlot.name}' — Inker 53.2 only supports {{> body }}. Named sections arrive in 53.3.`,
					{
						templatePath: layoutAbsPath,
						templateName: layoutValidated,
						line: unknownSlot.line,
						column: unknownSlot.column,
					},
				);
			}

			// 7. Missing-slot rejection (D11) — only when the body has real content.
			const hasBodySlot = hasBodySlotInNodes(layoutAst.nodes);
			if (!hasBodySlot && bodyHasContent(bodyAst)) {
				throw new InkerRenderError(
					"E_INKER_MISSING_SLOT",
					`Layout '${layoutValidated}' has no {{> body }} placeholder, cannot render body of child '${entryName}'`,
					{
						templatePath: layoutAbsPath,
						templateName: layoutValidated,
					},
				);
			}

			// 8. Resolve partials reachable from the layout AST.
			await this.#resolvePartialsIn(
				layoutAst,
				partialAsts,
				includeStack,
				layoutAbsPath,
			);

			// 8b. Validate slots-in-partials for any partial newly reached via the layout.
			for (const [partialName, partialAst] of partialAsts) {
				const slot = findFirstSlotIn(partialAst);
				if (slot !== undefined) {
					throw new InkerRenderError(
						"E_INKER_UNKNOWN_SLOT",
						`Partial '${partialName}' contains {{> ${slot.name} }} — slot placeholders are only valid inside layout files (line ${slot.line}, column ${slot.column})`,
						{
							templateName: partialName,
							line: slot.line,
							column: slot.column,
						},
					);
				}
			}

			// 9. Resolve components reachable from the layout + each partial.
			await this.#resolveComponentsIn(
				layoutAst.nodes,
				componentAsts,
				includeStack,
				layoutAbsPath,
			);
			for (const partialAst of partialAsts.values()) {
				await this.#resolveComponentsIn(
					partialAst.nodes,
					componentAsts,
					includeStack,
					layoutAbsPath,
				);
			}
		} finally {
			includeStack.delete(layoutAbsPath);
		}

		return {
			bodyAst,
			layoutAst,
			layoutName: layoutValidated,
			layoutAbsPath,
			partialAsts,
			componentAsts,
		};
	}

	async #resolvePartialsIn(
		ast: TemplateAst,
		partialAsts: Map<string, TemplateAst>,
		includeStack: Set<string>,
		hostAbsPath: string,
	): Promise<void> {
		const partialRefs: Array<{ name: string; line: number; column: number }> =
			[];
		collectPartialNodesInNodes(ast.nodes, partialRefs);

		for (const node of partialRefs) {
			const partialValidated = validateName(node.name);
			const partialAbsPath = path.join(this.#root, `${partialValidated}.inker`);
			assertContained(this.#root, partialAbsPath, partialValidated);
			const partialKey = normalizePartialKey(node.name);

			if (includeStack.has(partialAbsPath)) {
				throw new InkerRenderError(
					"E_INKER_CIRCULAR_INCLUDE",
					`Circular include: ${this.#cycleString(includeStack, partialAbsPath)} (referenced from ${hostAbsPath})`,
					{
						templatePath: partialAbsPath,
						templateName: partialValidated,
						line: node.line,
						column: node.column,
					},
				);
			}

			if (partialAsts.has(partialKey)) {
				// Already resolved (different host re-referenced the same partial).
				continue;
			}

			includeStack.add(partialAbsPath);
			let partialAst: TemplateAst;
			try {
				partialAst = await this.#loadAst(partialAbsPath, partialValidated);
			} catch (e) {
				includeStack.delete(partialAbsPath);
				throw e;
			}

			try {
				// Layout-in-partial rejection (recursive walk through If/Each too).
				const layoutSite = findFirstLayoutInNodes(partialAst.nodes);
				if (layoutSite !== undefined) {
					throw new InkerRenderError(
						"E_INKER_LAYOUT_IN_PARTIAL",
						`Partial file '${partialValidated}' contains {% layout %} — partials cannot declare layouts`,
						{
							templatePath: partialAbsPath,
							templateName: partialValidated,
							line: layoutSite.line,
							column: layoutSite.column,
						},
					);
				}

				partialAsts.set(partialKey, partialAst);

				// Recurse into nested partials.
				await this.#resolvePartialsIn(
					partialAst,
					partialAsts,
					includeStack,
					partialAbsPath,
				);
			} finally {
				includeStack.delete(partialAbsPath);
			}
		}
	}

	async #resolveComponentsIn(
		nodes: readonly InkerNode[],
		componentAsts: Map<string, TemplateAst>,
		includeStack: Set<string>,
		hostAbsPath: string,
	): Promise<void> {
		const componentRefs: Array<{ name: string; line: number; column: number }> =
			[];
		collectComponentNodesInNodes(nodes, componentRefs);

		for (const node of componentRefs) {
			const componentName = `components/${node.name}`;
			const componentValidated = validateName(componentName);
			const componentAbsPath = path.join(
				this.#root,
				`${componentValidated}.inker`,
			);
			assertContained(this.#root, componentAbsPath, componentValidated);
			const componentKey = normalizePartialKey(node.name);

			if (includeStack.has(componentAbsPath)) {
				throw new InkerRenderError(
					"E_INKER_CIRCULAR_INCLUDE",
					`Circular include: ${this.#cycleString(includeStack, componentAbsPath)} (referenced from ${hostAbsPath})`,
					{
						templatePath: componentAbsPath,
						templateName: componentValidated,
						line: node.line,
						column: node.column,
					},
				);
			}

			if (componentAsts.has(componentKey)) {
				continue;
			}

			includeStack.add(componentAbsPath);
			let componentAst: TemplateAst;
			try {
				componentAst = await this.#loadAst(
					componentAbsPath,
					componentValidated,
				);
			} catch (e) {
				includeStack.delete(componentAbsPath);
				throw e;
			}

			try {
				// Layout-in-component rejection (reuse E_INKER_LAYOUT_IN_PARTIAL
				// per AC5: same axis "layout in non-entry file").
				const layoutSite = findFirstLayoutInNodes(componentAst.nodes);
				if (layoutSite !== undefined) {
					throw new InkerRenderError(
						"E_INKER_LAYOUT_IN_PARTIAL",
						`Component file '${componentValidated}' contains {% layout %} — components cannot declare layouts`,
						{
							templatePath: componentAbsPath,
							templateName: componentValidated,
							line: layoutSite.line,
							column: layoutSite.column,
						},
					);
				}

				// Slot-leak rejection: components MUST NOT contain {{> body }}.
				const slot = findFirstSlotInNodes(componentAst.nodes);
				if (slot !== undefined) {
					throw new InkerRenderError(
						"E_INKER_UNKNOWN_SLOT",
						`Component '${componentValidated}' contains {{> ${slot.name} }} — slot placeholders are only valid inside layout files (line ${slot.line}, column ${slot.column})`,
						{
							templatePath: componentAbsPath,
							templateName: componentValidated,
							line: slot.line,
							column: slot.column,
						},
					);
				}

				componentAsts.set(componentKey, componentAst);

				// Recurse into nested components (component → component → component).
				await this.#resolveComponentsIn(
					componentAst.nodes,
					componentAsts,
					includeStack,
					componentAbsPath,
				);
			} finally {
				includeStack.delete(componentAbsPath);
			}
		}
	}

	#findUnknownSlot(ast: TemplateAst): SlotNode | undefined {
		return this.#findUnknownSlotInNodes(ast.nodes);
	}

	#findUnknownSlotInNodes(nodes: readonly InkerNode[]): SlotNode | undefined {
		for (const node of nodes) {
			if (node.kind === "Slot" && node.name !== "body") {
				return node;
			}
			if (node.kind === "If") {
				const inThen = this.#findUnknownSlotInNodes(node.thenNodes);
				if (inThen !== undefined) return inThen;
				if (node.elseNodes !== undefined) {
					const inElse = this.#findUnknownSlotInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
			}
			if (node.kind === "Each") {
				const inBody = this.#findUnknownSlotInNodes(node.bodyNodes);
				if (inBody !== undefined) return inBody;
				if (node.elseNodes !== undefined) {
					const inElse = this.#findUnknownSlotInNodes(node.elseNodes);
					if (inElse !== undefined) return inElse;
				}
			}
		}
		return undefined;
	}

	#cycleString(includeStack: Set<string>, revisited: string): string {
		const stackList = Array.from(includeStack);
		const revisitedIdx = stackList.indexOf(revisited);
		const cycleFrames =
			revisitedIdx >= 0 ? stackList.slice(revisitedIdx) : stackList;
		const rel = cycleFrames.map((p) => path.relative(this.#root, p));
		const relRevisited = path.relative(this.#root, revisited);
		return `${rel.join(" → ")} → ${relRevisited}`;
	}
}

export default Templates;
