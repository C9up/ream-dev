import { InkerRenderError } from "./InkerRenderError.js";
import { PROTOTYPE_POLLUTION_KEYS } from "./identifierGuards.js";
import type {
	EachBinding,
	InkerNode,
	InterpolationNode,
	TemplateAst,
} from "./parse.js";
import type {
	BinaryOp,
	Expression,
	PathExpression,
} from "./parseExpression.js";
import { resolvePath } from "./resolvePath.js";
import { SafeString } from "./SafeString.js";

// P4: maximum recursion depth for renderNodes. Templates that nest deeper
// — circular includes already blocked by `includeStack`, but a partial that
// renders a partial that renders a partial… via deep data shapes can blow
// the stack with a `RangeError` that violates the "always InkerRenderError"
// contract. 100 covers any realistic UX, surfaces a typed error otherwise.
const MAX_RENDER_DEPTH = 100;

export type HelperFn = (...args: readonly unknown[]) => string | SafeString;

export interface RenderContext {
	readonly templatePath?: string;
	readonly templateName?: string;
	readonly partialAsts?: ReadonlyMap<string, TemplateAst>;
	readonly componentAsts?: ReadonlyMap<string, TemplateAst>;
	readonly bodyHtml?: string;
	readonly helpers?: ReadonlyMap<string, HelperFn>;
}

function normalizePartialKey(name: string): string {
	// Two callers (Templates composer and direct renderAst) populate
	// partialAsts/componentAsts maps; both must agree on the canonical key.
	// Normalize by:
	//   1. stripping leading `./` segments (`./foo`, `././foo` → `foo`)
	//   2. removing intra-path `/./` segments (`foo/./bar` → `foo/bar`)
	//   3. collapsing repeated slashes (`foo//bar` → `foo/bar`)
	//   4. dropping trailing `/`
	// Backslashes and `..` segments are rejected at parse time
	// (validatePathName in parseBlockTag.ts), so we don't re-validate here.
	let key = name;
	while (key.startsWith("./")) key = key.slice(2);
	key = key.replace(/\/+/g, "/");
	key = key.replace(/\/\.\//g, "/");
	if (key.endsWith("/")) key = key.slice(0, -1);
	return key;
}

function escapeChar(ch: string): string {
	switch (ch) {
		case "&":
			return "&amp;";
		case "<":
			return "&lt;";
		case ">":
			return "&gt;";
		case '"':
			return "&quot;";
		case "'":
			return "&#39;";
		case "`":
			// Legacy IE / some permissive HTML parsers treat backtick as an attribute
			// delimiter inside unquoted attributes (`<div title={{ x }}>`), opening an
			// XSS vector. OWASP + Google escape recommendations include backtick.
			return "&#96;";
		default:
			return ch;
	}
}

function safeStringify(
	value: unknown,
	node: InterpolationNode,
	context: RenderContext,
): string {
	if (typeof value === "string") return value;
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	const errorContext = {
		templatePath: context.templatePath,
		templateName: context.templateName,
		line: node.line,
		column: node.column,
		expression: node.source,
	};
	if (typeof value === "symbol") {
		throw new InkerRenderError(
			"E_INKER_INVALID_EXPRESSION",
			`Cannot interpolate Symbol value for '${node.source}' at line ${node.line}, column ${node.column} — Symbols have no template string representation; convert explicitly via a helper`,
			errorContext,
		);
	}
	throw new InkerRenderError(
		"E_INKER_INVALID_EXPRESSION",
		`Cannot stringify ${typeof value === "object" ? Object.prototype.toString.call(value).slice(8, -1) : typeof value} value for '${node.source}' at line ${node.line}, column ${node.column} — use a specific field path (e.g. {{ ${node.source}.fieldName }}) or register a helper that returns a string`,
		errorContext,
	);
}

// P11: U+2028 and U+2029 are valid JS line terminators but pass intact
// through HTML; templates that interpolate `{{ x }}` inside a `<script>`
// literal would have the line broken by these codepoints, opening an XSS
// vector via the trailing `;` semicolon. Encode them defensively in
// addition to the standard 6-char set. Escapers for HTML-text-context
// (this function) and HTML-attribute (escapeAttr in InkerProvider) take
// different sets — the LS/PS handling is text-context-only because the
// only attribute interpretation is for inline-event handlers, which the
// docs already steer authors away from.
function escapeChar2028_2029(ch: string): string {
	return `&#x${ch.charCodeAt(0).toString(16)};`;
}

function escapeHtml(
	value: unknown,
	node: InterpolationNode,
	context: RenderContext,
): string {
	const str = safeStringify(value, node, context);
	return str
		.replace(/[&<>"'`]/g, escapeChar)
		.replace(/[\u2028\u2029]/g, escapeChar2028_2029);
}

type ComparableOp = Exclude<BinaryOp, "&&" | "||">;
type RelationalOp = "<" | "<=" | ">" | ">=";

function relationalCompare<T extends number | bigint | string>(
	op: RelationalOp,
	left: T,
	right: T,
	expr: {
		readonly line: number;
		readonly column: number;
		readonly source: string;
	},
	context: RenderContext,
): boolean {
	switch (op) {
		case "<":
			return left < right;
		case "<=":
			return left <= right;
		case ">":
			return left > right;
		case ">=":
			return left >= right;
	}
	const _exhaust: never = op;
	throw new InkerRenderError(
		"E_INKER_INVALID_EXPRESSION",
		`Unreachable: unknown relational operator ${JSON.stringify(_exhaust)} at line ${expr.line}, column ${expr.column}`,
		{
			templatePath: context.templatePath,
			templateName: context.templateName,
			line: expr.line,
			column: expr.column,
			expression: expr.source,
		},
	);
}

function compareBinary(
	op: ComparableOp,
	left: unknown,
	right: unknown,
	expr: {
		readonly line: number;
		readonly column: number;
		readonly source: string;
	},
	context: RenderContext,
): boolean {
	switch (op) {
		case "==":
			// biome-ignore lint/suspicious/noDoubleEquals: D12 implements JS loose-equality verbatim
			return left == right;
		case "!=":
			// biome-ignore lint/suspicious/noDoubleEquals: D12 implements JS loose-inequality verbatim
			return left != right;
		case "===":
			return left === right;
		case "!==":
			return left !== right;
	}
	// Relational (<, <=, >, >=) — both operands must be SAME type: both number,
	// both bigint, or both string. Mixed number+bigint succeeds at the JS layer
	// (`1n < 2`) but silently confuses authors who compare SQL bigint counts
	// against numeric literals — surface the type mismatch instead.
	// Symbol and other types throw E_INKER_INVALID_EXPRESSION rather than leak
	// native TypeError or surprising coercion ([] < 1).
	// Explicit case-per-op (no `>=` fallthrough) so adding a new ComparableOp
	// variant later fails loudly at the `_exhaust: never` arm rather than
	// being silently routed to `>=`.
	if (typeof left === "number" && typeof right === "number") {
		return relationalCompare(op, left, right, expr, context);
	}
	if (typeof left === "bigint" && typeof right === "bigint") {
		return relationalCompare(op, left, right, expr, context);
	}
	if (typeof left === "string" && typeof right === "string") {
		return relationalCompare(op, left, right, expr, context);
	}
	throw new InkerRenderError(
		"E_INKER_INVALID_EXPRESSION",
		`Cannot apply '${op}' to ${typeof left} and ${typeof right} at line ${expr.line}, column ${expr.column} — relational operators require both operands to be number/bigint or both string`,
		{
			templatePath: context.templatePath,
			templateName: context.templateName,
			line: expr.line,
			column: expr.column,
			expression: expr.source,
		},
	);
}

export function evalExpression(
	expr: Expression,
	data: Readonly<Record<string, unknown>>,
	context: RenderContext,
): unknown {
	switch (expr.kind) {
		case "Literal":
			return expr.value;
		case "Path":
			return resolvePath(data, expr.path, {
				templatePath: context.templatePath,
				templateName: context.templateName,
				line: expr.line,
				column: expr.column,
				expression: expr.source,
			});
		case "Group":
			return evalExpression(expr.expression, data, context);
		case "Unary":
			return !evalExpression(expr.operand, data, context);
		case "Binary": {
			const left = evalExpression(expr.left, data, context);
			if (expr.op === "&&") {
				if (!left) return left;
				return evalExpression(expr.right, data, context);
			}
			if (expr.op === "||") {
				if (left) return left;
				return evalExpression(expr.right, data, context);
			}
			const right = evalExpression(expr.right, data, context);
			return compareBinary(expr.op, left, right, expr, context);
		}
		case "Object": {
			// Object.create(null) — built-from-template-literals values must not
			// inherit Object.prototype methods (template authors who write
			// `{{ obj.toString }}` would otherwise hit the prototype's method,
			// not undefined).
			const result: Record<string, unknown> = Object.create(null);
			for (const entry of expr.entries) {
				result[entry.key] = evalExpression(entry.value, data, context);
			}
			return result;
		}
		case "Call": {
			const helper = context.helpers?.get(expr.name);
			if (helper === undefined) {
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_HELPER",
					`Helper '${expr.name}' is not registered in this Templates instance at line ${expr.line}, column ${expr.column}`,
					{
						templatePath: context.templatePath,
						templateName: context.templateName,
						line: expr.line,
						column: expr.column,
						expression: expr.name,
					},
				);
			}
			const args = expr.args.map((arg) => evalExpression(arg, data, context));
			const errorContext = {
				templatePath: context.templatePath,
				templateName: context.templateName,
				line: expr.line,
				column: expr.column,
				expression: expr.source,
			};
			let result: unknown;
			let thenProp: unknown;
			try {
				result = helper(...args);
				// `Reflect.get` runs INSIDE the helper try/catch so that a
				// poisoned getter (`get then() { throw … }`) is wrapped as
				// E_INKER_HELPER_THROW rather than leaking a raw TypeError.
				if (result !== null && typeof result === "object") {
					thenProp = Reflect.get(result, "then");
				}
			} catch (cause) {
				// Preserve typed InkerRenderError chain — helpers that themselves
				// call Templates#render or evalExpression must not have their
				// specific error codes masked under E_INKER_HELPER_THROW.
				if (cause instanceof InkerRenderError) throw cause;
				const message = cause instanceof Error ? cause.message : String(cause);
				throw new InkerRenderError(
					"E_INKER_HELPER_THROW",
					`Helper '${expr.name}' threw at line ${expr.line}, column ${expr.column}: ${message}`,
					errorContext,
					{ cause },
				);
			}
			// D2 — Inker is synchronous. A thenable return would silently render
			// "[object Promise]" so reject with a typed error pointing at the
			// call site.
			if (typeof thenProp === "function") {
				throw new InkerRenderError(
					"E_INKER_HELPER_THROW",
					`Helper '${expr.name}' returned a Promise/thenable at line ${expr.line}, column ${expr.column} — Inker renderers are synchronous (D2)`,
					errorContext,
				);
			}
			// D2 — helper return contract is `string | SafeString` (or null/undefined,
			// which the renderer suppresses). Anything else is a contract bug at the
			// helper, not a template-author mistake — still surface clearly.
			if (
				result !== null &&
				result !== undefined &&
				typeof result !== "string" &&
				!(result instanceof SafeString)
			) {
				throw new InkerRenderError(
					"E_INKER_HELPER_THROW",
					`Helper '${expr.name}' returned ${typeof result} at line ${expr.line}, column ${expr.column} — Inker helpers must return string | SafeString | null | undefined (D2)`,
					errorContext,
				);
			}
			return result;
		}
	}
}

export function renderAst(
	ast: TemplateAst,
	data: Readonly<Record<string, unknown>>,
	context: RenderContext = {},
): string {
	const buf: string[] = [];
	renderNodes(ast.nodes, data, context, buf, 0);
	return buf.join("");
}

function renderNodes(
	nodes: readonly InkerNode[],
	data: Readonly<Record<string, unknown>>,
	context: RenderContext,
	buf: string[],
	depth: number,
): void {
	// P4: typed-error guard around the JS call-stack ceiling. Without this,
	// a deeply-nested partial-or-component chain (or data-driven recursion
	// via includes-with-distinct-paths) blows the stack with a `RangeError`
	// not an `InkerRenderError`, violating the contract that every error
	// crossing the public surface carries a stable code.
	if (depth > MAX_RENDER_DEPTH) {
		throw new InkerRenderError(
			"E_INKER_INVALID_EXPRESSION",
			`Render recursion exceeded maximum depth ${MAX_RENDER_DEPTH} — likely cause: a partial/component chain or data-recursive 'each' that does not terminate`,
			{
				templatePath: context.templatePath,
				templateName: context.templateName,
			},
		);
	}
	for (const node of nodes) {
		switch (node.kind) {
			case "Text": {
				buf.push(node.value);
				break;
			}
			case "Interpolation": {
				const value = evalExpression(node.expression, data, context);
				if (value instanceof SafeString) {
					buf.push(value.value);
				} else if (value === null || value === undefined) {
					buf.push("");
				} else if (node.escape) {
					buf.push(escapeHtml(value, node, context));
				} else {
					buf.push(safeStringify(value, node, context));
				}
				break;
			}
			case "Slot": {
				if (node.name !== "body") {
					throw new InkerRenderError(
						"E_INKER_UNKNOWN_SLOT",
						`Unknown slot '${node.name}' — Inker only supports {{> body }} as of 53.4.`,
						{
							templatePath: context.templatePath,
							templateName: context.templateName,
							line: node.line,
							column: node.column,
						},
					);
				}
				if (context.bodyHtml !== undefined) {
					// Runtime type check: bodyHtml is typed as `string` but the
					// context boundary erodes via `as` / unchecked JSON. A
					// non-string slips into buf.join("") and renders as
					// `[object Object]` / `42` etc. — surface the contract bug.
					if (typeof context.bodyHtml !== "string") {
						throw new InkerRenderError(
							"E_INKER_INVALID_EXPRESSION",
							`Layout body must be a string; got ${typeof context.bodyHtml} at slot '${node.name}' (line ${node.line}, column ${node.column})`,
							{
								templatePath: context.templatePath,
								templateName: context.templateName,
								line: node.line,
								column: node.column,
							},
						);
					}
					buf.push(context.bodyHtml);
				}
				break;
			}
			case "Partial": {
				const partialAst = context.partialAsts?.get(
					normalizePartialKey(node.name),
				);
				if (partialAst === undefined) {
					throw new InkerRenderError(
						"E_INKER_DISK_REQUIRED",
						`renderAst cannot resolve {% include '${node.name}' %} — partial not pre-loaded into context.partialAsts; use Templates#render(name, data) instead, or pre-resolve all partials before calling renderAst`,
						{
							templatePath: context.templatePath,
							templateName: context.templateName,
							line: node.line,
							column: node.column,
						},
					);
				}
				renderNodes(
					partialAst.nodes,
					data,
					{
						...context,
						templateName: node.name,
					},
					buf,
					depth + 1,
				);
				break;
			}
			case "Layout": {
				throw new InkerRenderError(
					"E_INKER_DISK_REQUIRED",
					`renderAst cannot resolve {% layout '${node.name}' %} — LayoutNode must be stripped by the composer before render; use Templates#render(name, data) instead`,
					{
						templatePath: context.templatePath,
						templateName: context.templateName,
						line: node.line,
						column: node.column,
					},
				);
			}
			case "If": {
				const value = evalExpression(node.condition.expression, data, context);
				if (value) {
					renderNodes(node.thenNodes, data, context, buf, depth + 1);
				} else if (node.elseNodes !== undefined) {
					renderNodes(node.elseNodes, data, context, buf, depth + 1);
				}
				break;
			}
			case "Each": {
				renderEach(node, data, context, buf, depth + 1);
				break;
			}
			case "Component": {
				const componentAst = context.componentAsts?.get(
					normalizePartialKey(node.name),
				);
				if (componentAst === undefined) {
					throw new InkerRenderError(
						"E_INKER_DISK_REQUIRED",
						`renderAst cannot resolve {% component '${node.name}' %} — component not pre-loaded into context.componentAsts; use Templates#render(name, data) instead`,
						{
							templatePath: context.templatePath,
							templateName: context.templateName,
							line: node.line,
							column: node.column,
						},
					);
				}
				// Object.create(null) — component scope keys (template-author-controlled
				// via {% component 'x' { key: value } %}) must not inherit
				// Object.prototype methods, so {{ scope.toString }} resolves to
				// undefined (data lookup) rather than the prototype's method.
				const scopedData: Record<string, unknown> = Object.create(null);
				for (const arg of node.args) {
					scopedData[arg.key] = evalExpression(arg.value, data, context);
				}
				renderNodes(
					componentAst.nodes,
					scopedData,
					{
						...context,
						templateName: node.name,
						bodyHtml: undefined,
					},
					buf,
					depth + 1,
				);
				break;
			}
			default: {
				const _exhaust: never = node;
				// Use the typed-error contract (not raw `Error`) so callers can
				// distinguish "Inker template bug" from "system failure".
				throw new InkerRenderError(
					"E_INKER_INVALID_EXPRESSION",
					`Unreachable: unknown node kind ${JSON.stringify(_exhaust)}`,
					{
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
		}
	}
}

function bindingPreview(binding: EachBinding): string {
	if (binding.kind === "Single") return binding.name;
	return `[${binding.names[0]}, ${binding.names[1]}]`;
}

function typeOfIterable(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (value instanceof Map) return "Map";
	if (value instanceof Set) return "Set";
	if (Array.isArray(value)) return "Array";
	return typeof value;
}

function failInvalidIterable(
	node: {
		readonly iterableSource: string;
		readonly binding: EachBinding;
		readonly line: number;
		readonly column: number;
	},
	context: RenderContext,
	reason: string,
): never {
	throw new InkerRenderError(
		"E_INKER_INVALID_ITERABLE",
		`{% each ${node.iterableSource} as ${bindingPreview(node.binding)} %} ${reason} at line ${node.line}, column ${node.column}`,
		{
			templatePath: context.templatePath,
			templateName: context.templateName,
			line: node.line,
			column: node.column,
			expression: node.iterableSource,
		},
	);
}

function renderEach(
	node: {
		readonly kind: "Each";
		readonly iterable: Expression;
		readonly iterableSource: string;
		readonly binding: EachBinding;
		readonly bodyNodes: readonly InkerNode[];
		readonly elseNodes?: readonly InkerNode[];
		readonly line: number;
		readonly column: number;
	},
	data: Readonly<Record<string, unknown>>,
	context: RenderContext,
	buf: string[],
	depth: number,
): void {
	const iterable = evalExpression(node.iterable, data, context);

	if (node.binding.kind === "Single") {
		if (!Array.isArray(iterable)) {
			const typeLabel = typeOfIterable(iterable);
			const hint =
				iterable === null || iterable === undefined
					? ` — did you forget '{% if ${node.iterableSource} %}' wrapper?`
					: " (single-binding 'as item' only accepts Array; use 'as [k, v]' for Map/Set/object)";
			failInvalidIterable(
				node,
				context,
				`expected an Array; got ${typeLabel}${hint}`,
			);
		}
		if (iterable.length === 0) {
			if (node.elseNodes !== undefined) {
				renderNodes(node.elseNodes, data, context, buf, depth);
			}
			return;
		}
		const bindingName = node.binding.name;
		for (let i = 0; i < iterable.length; i += 1) {
			if (!Object.hasOwn(iterable, i)) {
				failInvalidIterable(
					node,
					context,
					`encountered a sparse-array hole at index ${i}`,
				);
			}
			// `Object.assign(Object.create(null), data, …)` preserves the
			// null-prototype invariant established by the component scope
			// (`Object.create(null)` on the component arm). A naive
			// `{ ...data, … }` spread would silently re-introduce
			// Object.prototype and expose `{{ toString }}` etc. via the
			// prototype chain — defense-in-depth even though resolvePath also
			// uses `Object.hasOwn`.
			const scoped = Object.assign(Object.create(null), data, {
				[bindingName]: iterable[i],
			});
			renderNodes(node.bodyNodes, scoped, context, buf, depth);
		}
		return;
	}

	// Destructured binding `as [k, v]`.
	const [kName, vName] = node.binding.names;

	const renderPair = (k: unknown, v: unknown): void => {
		// Same null-prototype preservation as the single-binding arm above.
		const scoped = Object.assign(Object.create(null), data, {
			[kName]: k,
			[vName]: v,
		});
		renderNodes(node.bodyNodes, scoped, context, buf, depth);
	};

	if (iterable === null || iterable === undefined) {
		failInvalidIterable(
			node,
			context,
			`expected Array | Map | Set | object; got ${typeOfIterable(iterable)} — did you forget '{% if ${node.iterableSource} %}' wrapper?`,
		);
	}

	if (iterable instanceof Map) {
		if (iterable.size === 0) {
			if (node.elseNodes !== undefined) {
				renderNodes(node.elseNodes, data, context, buf, depth);
			}
			return;
		}
		for (const [k, v] of iterable.entries()) {
			renderPair(k, v);
		}
		return;
	}

	if (iterable instanceof Set) {
		if (iterable.size === 0) {
			if (node.elseNodes !== undefined) {
				renderNodes(node.elseNodes, data, context, buf, depth);
			}
			return;
		}
		let idx = 0;
		for (const item of iterable) {
			renderPair(idx, item);
			idx += 1;
		}
		return;
	}

	if (Array.isArray(iterable)) {
		if (iterable.length === 0) {
			if (node.elseNodes !== undefined) {
				renderNodes(node.elseNodes, data, context, buf, depth);
			}
			return;
		}
		for (let i = 0; i < iterable.length; i += 1) {
			if (!Object.hasOwn(iterable, i)) {
				failInvalidIterable(
					node,
					context,
					`encountered a sparse-array hole at index ${i}`,
				);
			}
			const elem = iterable[i];
			if (!Array.isArray(elem) || elem.length !== 2) {
				failInvalidIterable(
					node,
					context,
					`destructured binding expects each element to be a 2-tuple; got ${typeOfIterable(elem)} at index ${i}`,
				);
			}
			// Reject sparse-hole pairs (`[[ , 'x']]`) symmetrically with the
			// outer-array sparse-hole check above; otherwise `elem[0]` silently
			// binds to undefined.
			if (!Object.hasOwn(elem, 0) || !Object.hasOwn(elem, 1)) {
				failInvalidIterable(
					node,
					context,
					`destructured pair at index ${i} contains a sparse-array hole`,
				);
			}
			renderPair(elem[0], elem[1]);
		}
		return;
	}

	if (typeof iterable === "object") {
		// Only plain objects (Object.prototype or null-prototype) iterate via
		// Object.entries — Date / Promise / RegExp / class instances would
		// silently return [] (no own-enumerable string keys) and hit the
		// else-branch with no diagnostic.
		const proto = Object.getPrototypeOf(iterable);
		if (proto !== Object.prototype && proto !== null) {
			const tag = Object.prototype.toString.call(iterable).slice(8, -1);
			failInvalidIterable(
				node,
				context,
				`expected plain object; got ${tag} (use Object.fromEntries() if you have a class instance, or iterate explicitly)`,
			);
		}
		const entries = Object.entries(iterable);
		if (entries.length === 0) {
			if (node.elseNodes !== undefined) {
				renderNodes(node.elseNodes, data, context, buf, depth);
			}
			return;
		}
		for (const [k, v] of entries) {
			// P2: filter `__proto__` / `constructor` / `prototype` own-properties
			// that survive `JSON.parse('{"__proto__":…}')`. `Object.entries`
			// enumerates them as regular own enumerable keys; without this guard
			// the template `{% each data as [k, v] %}` would surface the dunder
			// name as the bound `k`, and any downstream `Object.assign(target,
			// scope)` could pollute the global prototype chain. The same
			// rejection applies to Map/Set with such keys via `entries()`,
			// but only `Object.entries` of a JSON-derived object surfaces
			// `__proto__` as an own key in practice.
			if (PROTOTYPE_POLLUTION_KEYS.has(k)) continue;
			renderPair(k, v);
		}
		return;
	}

	failInvalidIterable(
		node,
		context,
		`destructured binding requires Array | Map | Set | object; got ${typeOfIterable(iterable)}`,
	);
}

// Re-export the Path expression type so consumers that only need the
// rendering surface need not pull `parseExpression.ts` directly.
export type { PathExpression };
