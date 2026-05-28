import { InkerRenderError } from "./InkerRenderError.js";
import {
	PROTOTYPE_POLLUTION_KEYS,
	RESERVED_BINDING_NAMES,
} from "./identifierGuards.js";
import type {
	ComponentArg,
	ComponentNode,
	EachBinding,
	IfCondition,
	LayoutNode,
	PartialNode,
} from "./parse.js";
import type { Expression, ObjectExpression } from "./parseExpression.js";
import { parseExpression } from "./parseExpression.js";

const REJECTED_DIRECTIVES: ReadonlySet<string> = new Set([
	"for",
	"endfor",
	"endcomponent",
	"unless",
	"endunless",
	"set",
	"let",
	"raw",
	"endraw",
	"block",
	"endblock",
	"section",
	"endsection",
	"extends",
	"import",
	"from",
	"with",
	"as",
]);

const KNOWN_KEYWORDS: ReadonlySet<string> = new Set([
	"layout",
	"include",
	"if",
	"else",
	"endif",
	"each",
	"endeach",
	"component",
]);

const BINDING_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const UNKNOWN_DIRECTIVE_HINT =
	"Inker 53.4 supports `layout`, `include`, `if`/`else`/`endif`, `each`/`endeach`, and `component`.";

function failParse(
	message: string,
	line: number,
	column: number,
	templatePath?: string,
): never {
	throw new InkerRenderError(
		"E_INKER_PARSE_ERROR",
		`${message} at line ${line}, column ${column}`,
		{ line, column, templatePath },
	);
}

function failInvalidExpression(
	message: string,
	line: number,
	column: number,
	templatePath?: string,
): never {
	throw new InkerRenderError(
		"E_INKER_INVALID_EXPRESSION",
		`${message} at line ${line}, column ${column}.`,
		{ line, column, templatePath },
	);
}

function failUnknownDirective(
	keyword: string,
	line: number,
	column: number,
	templatePath?: string,
): never {
	throw new InkerRenderError(
		"E_INKER_UNKNOWN_DIRECTIVE",
		`Directive '${keyword}' not supported — ${UNKNOWN_DIRECTIVE_HINT} (at line ${line}, column ${column})`,
		{ line, column, templatePath },
	);
}

function isWhitespace(ch: string | undefined): boolean {
	return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function skipWhitespace(raw: string, i: number): number {
	let j = i;
	while (j < raw.length && isWhitespace(raw[j])) {
		j += 1;
	}
	return j;
}

function readKeyword(
	raw: string,
	i: number,
): { keyword: string; next: number } {
	let j = i;
	while (j < raw.length && !isWhitespace(raw[j]) && raw[j] !== "{") {
		j += 1;
	}
	return { keyword: raw.slice(i, j), next: j };
}

function readQuotedString(
	raw: string,
	i: number,
	line: number,
	column: number,
	templatePath: string | undefined,
): { value: string; next: number } {
	const quote = raw[i];
	if (quote !== "'" && quote !== '"') {
		failParse(
			"directive requires a quoted template name",
			line,
			column,
			templatePath,
		);
	}
	let j = i + 1;
	let out = "";
	while (j < raw.length) {
		const c = raw[j];
		if (c === "\\") {
			const next = raw[j + 1];
			if (next === undefined) {
				failParse(
					"unterminated escape inside quoted template name",
					line,
					column,
					templatePath,
				);
			}
			if (next === "\\" || next === quote) {
				out += next;
				j += 2;
				continue;
			}
			failParse(
				`unsupported escape sequence '\\${next}' inside quoted template name (only \\\\ and \\${quote} allowed)`,
				line,
				column,
				templatePath,
			);
		}
		if (c === quote) {
			return { value: out, next: j + 1 };
		}
		out += c;
		j += 1;
	}
	return failParse(
		"unterminated quoted template name",
		line,
		column,
		templatePath,
	);
}

function validatePathName(
	name: string,
	line: number,
	column: number,
	templatePath: string | undefined,
): void {
	if (name.length === 0) {
		failParse(
			"directive requires a non-empty template name",
			line,
			column,
			templatePath,
		);
	}
	if (name.includes("\0")) {
		failParse("template name contains a NUL byte", line, column, templatePath);
	}
	if (name.includes("\\")) {
		failParse(
			`Template name must use forward slashes; got '${name}'`,
			line,
			column,
			templatePath,
		);
	}
	if (name.startsWith("/")) {
		failParse(
			`Template name must be relative to the templates root; got absolute path '${name}'`,
			line,
			column,
			templatePath,
		);
	}
	// Drive-letter forms: `C:foo` (no separator, CWD-of-drive on Windows) and
	// `C:/foo` / `C:\foo`. The previous regex only caught the slash-form; the
	// bare-colon form reached the loader as-is.
	if (/^[A-Za-z]:/.test(name)) {
		failParse(
			`Template name must be relative to the templates root; got absolute path '${name}'`,
			line,
			column,
			templatePath,
		);
	}
	// Tilde-prefix gets expanded by some loaders to the user-home — refuse to
	// hand a sandbox-escape vector to the path resolver.
	if (name.startsWith("~")) {
		failParse(
			`Template name cannot start with '~' (tilde expansion is not supported); got '${name}'`,
			line,
			column,
			templatePath,
		);
	}
	const segments = name.split("/");
	for (const segment of segments) {
		if (segment === "..") {
			failParse(
				`Template name cannot contain '..' segments; got '${name}'`,
				line,
				column,
				templatePath,
			);
		}
		if (segment === "") {
			// Empty segment from `//` (also catches `foo//bar` and trailing `foo/`).
			// Authoring mistake or cache-poisoning surface — two distinct names
			// resolve to the same file but key the cache differently.
			failParse(
				`Template name cannot contain empty path segments; got '${name}'`,
				line,
				column,
				templatePath,
			);
		}
		if (segment === ".") {
			failParse(
				`Template name cannot contain '.' segments; got '${name}'`,
				line,
				column,
				templatePath,
			);
		}
	}
}

function parseLayoutOrInclude(
	keyword: "layout" | "include",
	raw: string,
	line: number,
	column: number,
	templatePath: string | undefined,
	afterKeyword: number,
): LayoutNode | PartialNode {
	const afterKwSpace = skipWhitespace(raw, afterKeyword);
	if (afterKwSpace >= raw.length) {
		failParse(
			`${keyword} directive requires a quoted template name; got '${raw}'`,
			line,
			column,
			templatePath,
		);
	}

	const { value: name, next } = readQuotedString(
		raw,
		afterKwSpace,
		line,
		column,
		templatePath,
	);

	validatePathName(name, line, column, templatePath);

	const afterName = skipWhitespace(raw, next);
	if (afterName < raw.length) {
		const trailing = raw.slice(next);
		failParse(
			`Unexpected tokens after ${keyword} name: '${trailing}'`,
			line,
			column,
			templatePath,
		);
	}

	if (keyword === "layout") {
		const node: LayoutNode = Object.freeze({
			kind: "Layout",
			name,
			raw,
			line,
			column,
		});
		return node;
	}

	const node: PartialNode = Object.freeze({
		kind: "Partial",
		name,
		raw,
		line,
		column,
	});
	return node;
}

export interface ParseIfTagResult {
	readonly kind: "If";
	readonly condition: IfCondition;
}

export function parseIfTag(
	raw: string,
	line: number,
	column: number,
	templatePath: string | undefined,
	afterKeyword: number,
	helpers: ReadonlySet<string>,
): ParseIfTagResult {
	const i = skipWhitespace(raw, afterKeyword);
	if (i >= raw.length) {
		failInvalidExpression(
			"if directive requires an expression",
			line,
			column,
			templatePath,
		);
	}

	const exprSource = raw.slice(i).trim();
	if (exprSource.length === 0) {
		failInvalidExpression(
			"if directive requires an expression",
			line,
			column,
			templatePath,
		);
	}

	const expression = parseExpression(exprSource, line, column, {
		templatePath,
		helpers,
	});

	const condition: IfCondition = Object.freeze({
		expression,
		source: exprSource,
	});
	return { kind: "If", condition };
}

export interface ParseEachTagResult {
	readonly kind: "Each";
	readonly iterable: Expression;
	readonly iterableSource: string;
	readonly binding: EachBinding;
}

function parseDestructuredBinding(
	raw: string,
	startInBinding: number,
	line: number,
	column: number,
	templatePath: string | undefined,
): EachBinding {
	let i = startInBinding;
	if (raw[i] !== "[") {
		failInvalidExpression(
			"destructured each binding must start with '['",
			line,
			column,
			templatePath,
		);
	}
	i += 1;
	const readName = (): string => {
		i = skipWhitespace(raw, i);
		const start = i;
		while (i < raw.length && /[a-zA-Z0-9_$]/.test(raw[i] ?? "")) {
			i += 1;
		}
		const name = raw.slice(start, i);
		if (name.length === 0) {
			failInvalidExpression(
				"destructured each binding expected identifier",
				line,
				column,
				templatePath,
			);
		}
		if (!BINDING_RE.test(name)) {
			failInvalidExpression(
				`destructured each binding '${name}' is not a valid identifier`,
				line,
				column,
				templatePath,
			);
		}
		if (RESERVED_BINDING_NAMES.has(name)) {
			failInvalidExpression(
				`destructured each binding '${name}' is a reserved word`,
				line,
				column,
				templatePath,
			);
		}
		if (PROTOTYPE_POLLUTION_KEYS.has(name)) {
			failInvalidExpression(
				`destructured each binding '${name}' is forbidden (prototype-pollution surface)`,
				line,
				column,
				templatePath,
			);
		}
		return name;
	};

	const first = readName();
	i = skipWhitespace(raw, i);
	if (raw[i] !== ",") {
		failInvalidExpression(
			"destructured each binding must have exactly two names: '[k, v]'",
			line,
			column,
			templatePath,
		);
	}
	i += 1;
	const second = readName();
	i = skipWhitespace(raw, i);
	if (raw[i] !== "]") {
		const peek = raw[i];
		if (peek === ",") {
			failInvalidExpression(
				"destructured each binding has too many names — exactly two allowed",
				line,
				column,
				templatePath,
			);
		}
		failInvalidExpression(
			"destructured each binding expected ']' to close the pair",
			line,
			column,
			templatePath,
		);
	}
	i += 1;
	const trailing = raw.slice(i).trim();
	if (trailing.length > 0) {
		failInvalidExpression(
			`unexpected tokens after destructured binding: '${trailing}'`,
			line,
			column,
			templatePath,
		);
	}
	if (first === second) {
		failInvalidExpression(
			`destructured each binding has duplicate name '${first}'`,
			line,
			column,
			templatePath,
		);
	}
	return { kind: "Destructured", names: [first, second] };
}

/**
 * Locate the ` as ` separator inside an each directive's body, honoring
 * string literals and bracket/brace/paren nesting so that iterables like
 * `helper(" as data")` or `items[' as ']` don't trip on the inner ` as `.
 *
 * Returns the [start, end] index range of the matched whitespace+as+whitespace
 * segment in `s`, or `null` if no top-level ` as ` exists. `start` points at
 * the first whitespace char before `as`; `end` points one past the last
 * whitespace char after `as`.
 */
function findTopLevelAs(s: string): { start: number; end: number } | null {
	let depth = 0;
	let stringDelim: '"' | "'" | null = null;
	let i = 0;
	while (i < s.length) {
		const c = s[i];
		if (stringDelim !== null) {
			if (c === "\\" && i + 1 < s.length) {
				i += 2;
				continue;
			}
			if (c === stringDelim) {
				stringDelim = null;
			}
			i += 1;
			continue;
		}
		if (c === '"' || c === "'") {
			stringDelim = c;
			i += 1;
			continue;
		}
		if (c === "[" || c === "(" || c === "{") {
			depth += 1;
			i += 1;
			continue;
		}
		if (c === "]" || c === ")" || c === "}") {
			depth -= 1;
			i += 1;
			continue;
		}
		if (depth === 0 && isWhitespace(c)) {
			// Scan a whitespace run, then probe for `as` followed by more
			// whitespace. The ` as ` keyword can only sit at top level (depth 0,
			// outside any string).
			const wsStart = i;
			while (i < s.length && isWhitespace(s[i])) {
				i += 1;
			}
			if (s[i] === "a" && s[i + 1] === "s" && isWhitespace(s[i + 2])) {
				let j = i + 2;
				while (j < s.length && isWhitespace(s[j])) {
					j += 1;
				}
				return { start: wsStart, end: j };
			}
			continue;
		}
		i += 1;
	}
	return null;
}

export function parseEachTag(
	raw: string,
	line: number,
	column: number,
	templatePath: string | undefined,
	afterKeyword: number,
	helpers: ReadonlySet<string>,
): ParseEachTagResult {
	const start = skipWhitespace(raw, afterKeyword);
	if (start >= raw.length) {
		failInvalidExpression(
			"each directive requires '<iterable> as <binding>'",
			line,
			column,
			templatePath,
		);
	}

	const body = raw.slice(start);
	const asMatch = findTopLevelAs(body);
	if (asMatch === null) {
		failInvalidExpression(
			"each directive requires '<iterable> as <binding>' — missing 'as' keyword",
			line,
			column,
			templatePath,
		);
	}

	const iterableSource = body.slice(0, asMatch.start).trim();
	if (iterableSource.length === 0) {
		failInvalidExpression(
			"each directive requires an iterable expression before 'as'",
			line,
			column,
			templatePath,
		);
	}
	const iterable = parseExpression(iterableSource, line, column, {
		templatePath,
		helpers,
	});

	const afterAs = start + asMatch.end;
	const bindingTailRaw = raw.slice(afterAs);
	const bindingTail = bindingTailRaw.trim();
	if (bindingTail.length === 0) {
		failInvalidExpression(
			"each directive requires a binding identifier after 'as'",
			line,
			column,
			templatePath,
		);
	}

	if (bindingTail.startsWith("[")) {
		// Find the absolute position of the `[` in the raw string for accurate
		// downstream scanning.
		const bracketAt = afterAs + bindingTailRaw.indexOf("[");
		const binding = parseDestructuredBinding(
			raw,
			bracketAt,
			line,
			column,
			templatePath,
		);
		return {
			kind: "Each",
			iterable,
			iterableSource,
			binding,
		};
	}

	if (!BINDING_RE.test(bindingTail)) {
		failInvalidExpression(
			`each binding '${bindingTail}' is not a valid identifier (must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/)`,
			line,
			column,
			templatePath,
		);
	}
	if (RESERVED_BINDING_NAMES.has(bindingTail)) {
		failInvalidExpression(
			`each binding '${bindingTail}' is a reserved word`,
			line,
			column,
			templatePath,
		);
	}
	if (PROTOTYPE_POLLUTION_KEYS.has(bindingTail)) {
		failInvalidExpression(
			`each binding '${bindingTail}' is forbidden (prototype-pollution surface)`,
			line,
			column,
			templatePath,
		);
	}

	return {
		kind: "Each",
		iterable,
		iterableSource,
		binding: { kind: "Single", name: bindingTail },
	};
}

export function parseComponentTag(
	raw: string,
	line: number,
	column: number,
	templatePath: string | undefined,
	afterKeyword: number,
	helpers: ReadonlySet<string>,
): ComponentNode {
	const afterKwSpace = skipWhitespace(raw, afterKeyword);
	if (afterKwSpace >= raw.length) {
		failInvalidExpression(
			"component directive requires a quoted component name",
			line,
			column,
			templatePath,
		);
	}

	const { value: name, next } = readQuotedString(
		raw,
		afterKwSpace,
		line,
		column,
		templatePath,
	);
	validatePathName(name, line, column, templatePath);

	let i = skipWhitespace(raw, next);
	const args: ComponentArg[] = [];

	if (i < raw.length) {
		if (raw[i] !== "{") {
			failInvalidExpression(
				`component directive expected '{' after name, got '${raw[i]}'`,
				line,
				column,
				templatePath,
			);
		}
		// Parse the args literal as a full ObjectExpression — same grammar as
		// any other object literal in 53.4, with all the literal/path/call/
		// shorthand/comparator/logical features. Walk forwards through `raw`
		// from `i` to locate the matching `}` accounting for nested braces,
		// brackets, and string literals so we can hand `parseExpression` a
		// clean object-literal slice.
		const objStart = i;
		const objSource = sliceBalancedObject(
			raw,
			objStart,
			line,
			column,
			templatePath,
		);
		// P16: compute the line/column at `objStart` within `raw` so any
		// parse error inside the object literal points at the actual `{`
		// position rather than at the start of the `{% component %}` block
		// tag. Block tags may span multiple lines (templates often wrap
		// long `{% each %}` clauses), so this matters in practice.
		let objLine = line;
		let objColumn = column;
		for (let k = 0; k < objStart; k += 1) {
			if (raw[k] === "\n") {
				objLine += 1;
				objColumn = 1;
			} else {
				objColumn += 1;
			}
		}
		const objExpr = parseExpression(objSource, objLine, objColumn, {
			templatePath,
			helpers,
		});
		if (objExpr.kind !== "Object") {
			failInvalidExpression(
				"component directive expected an object literal for args",
				line,
				column,
				templatePath,
			);
		}
		const obj: ObjectExpression = objExpr;
		const seenKeys = new Set<string>();
		for (const entry of obj.entries) {
			if (seenKeys.has(entry.key)) {
				// Defensive — parseExpression already rejects duplicates, but
				// keep a guard in case the grammar changes.
				failInvalidExpression(
					`component arg key '${entry.key}' is duplicated`,
					line,
					column,
					templatePath,
				);
			}
			seenKeys.add(entry.key);
			args.push(
				Object.freeze({
					key: entry.key,
					value: entry.value,
					source: entry.value.source,
				}),
			);
		}
		i = objStart + objSource.length;
	}

	const trailing = raw.slice(i).trim();
	if (trailing.length > 0) {
		failInvalidExpression(
			`Unexpected tokens after component args: '${trailing}'`,
			line,
			column,
			templatePath,
		);
	}

	const node: ComponentNode = Object.freeze({
		kind: "Component",
		name,
		args: Object.freeze(args),
		raw,
		line,
		column,
	});
	return node;
}

/**
 * Slice an object literal (`{ … }`) from `raw` starting at `start`,
 * accounting for nested braces / brackets / parens and string literals.
 * Returns the substring including both `{` and `}`. Throws
 * E_INKER_INVALID_EXPRESSION on unterminated input.
 *
 * P7: tracks opener kinds on an explicit stack so mismatched closers
 * (`(]`, `[)`, `{]`, …) surface as a structural error instead of being
 * silently absorbed by independent depth counters that allow
 * `((`-then-`)` plus `[`-then-`)` to net to zero each.
 */
function sliceBalancedObject(
	raw: string,
	start: number,
	line: number,
	column: number,
	templatePath: string | undefined,
): string {
	if (raw[start] !== "{") {
		failInvalidExpression(
			"expected '{' to start object literal",
			line,
			column,
			templatePath,
		);
	}
	const openerStack: Array<"{" | "[" | "("> = [];
	let stringChar: string | null = null;
	let i = start;
	while (i < raw.length) {
		const ch = raw[i];
		if (stringChar !== null) {
			if (ch === "\\" && i + 1 < raw.length) {
				i += 2;
				continue;
			}
			if (ch === stringChar) stringChar = null;
			i += 1;
			continue;
		}
		if (ch === "'" || ch === '"') {
			stringChar = ch;
			i += 1;
			continue;
		}
		if (ch === "{" || ch === "[" || ch === "(") {
			openerStack.push(ch);
		} else if (ch === "}" || ch === "]" || ch === ")") {
			const expectedOpener = ch === "}" ? "{" : ch === "]" ? "[" : "(";
			const top = openerStack[openerStack.length - 1];
			if (top !== expectedOpener) {
				failInvalidExpression(
					`mismatched bracket in component args literal: '${ch}' has no matching opener (expected to close '${top ?? "<empty>"}')`,
					line,
					column,
					templatePath,
				);
			}
			openerStack.pop();
			if (openerStack.length === 0) {
				return raw.slice(start, i + 1);
			}
		}
		i += 1;
	}
	return failInvalidExpression(
		"component args literal is unterminated; expected '}'",
		line,
		column,
		templatePath,
	);
}

export interface BlockOpenIfToken {
	readonly kind: "BlockOpenIf";
	readonly condition: IfCondition;
	readonly line: number;
	readonly column: number;
}

export interface BlockOpenEachToken {
	readonly kind: "BlockOpenEach";
	readonly iterable: Expression;
	readonly iterableSource: string;
	readonly binding: EachBinding;
	readonly line: number;
	readonly column: number;
}

export interface BlockCloseToken {
	readonly kind: "BlockClose";
	readonly closes: "If" | "Each";
	readonly line: number;
	readonly column: number;
}

export interface ElseToken {
	readonly kind: "Else";
	readonly line: number;
	readonly column: number;
}

export type ParsedBlockTag =
	| LayoutNode
	| PartialNode
	| ComponentNode
	| BlockOpenIfToken
	| BlockOpenEachToken
	| BlockCloseToken
	| ElseToken;

export interface ParseBlockTagOptions {
	templatePath?: string;
	helpers?: ReadonlySet<string>;
}

export function parseBlockTag(
	raw: string,
	line: number,
	column: number,
	options: ParseBlockTagOptions = {},
): ParsedBlockTag {
	const { templatePath } = options;
	const helpers: ReadonlySet<string> = options.helpers ?? new Set();

	const startOfKeyword = skipWhitespace(raw, 0);
	const { keyword, next: afterKeyword } = readKeyword(raw, startOfKeyword);

	if (keyword.length === 0) {
		failParse("Empty block tag directive", line, column, templatePath);
	}

	if (REJECTED_DIRECTIVES.has(keyword)) {
		failUnknownDirective(keyword, line, column, templatePath);
	}

	if (!KNOWN_KEYWORDS.has(keyword)) {
		failUnknownDirective(keyword, line, column, templatePath);
	}

	if (keyword === "layout" || keyword === "include") {
		return parseLayoutOrInclude(
			keyword,
			raw,
			line,
			column,
			templatePath,
			afterKeyword,
		);
	}

	if (keyword === "if") {
		const { condition } = parseIfTag(
			raw,
			line,
			column,
			templatePath,
			afterKeyword,
			helpers,
		);
		return Object.freeze({
			kind: "BlockOpenIf",
			condition,
			line,
			column,
		});
	}

	if (keyword === "each") {
		const { iterable, iterableSource, binding } = parseEachTag(
			raw,
			line,
			column,
			templatePath,
			afterKeyword,
			helpers,
		);
		return Object.freeze({
			kind: "BlockOpenEach",
			iterable,
			iterableSource,
			binding,
			line,
			column,
		});
	}

	if (keyword === "endif") {
		const trailing = raw.slice(afterKeyword).trim();
		if (trailing.length > 0) {
			failParse(
				`Unexpected tokens after endif: '${trailing}'`,
				line,
				column,
				templatePath,
			);
		}
		return Object.freeze({ kind: "BlockClose", closes: "If", line, column });
	}

	if (keyword === "endeach") {
		const trailing = raw.slice(afterKeyword).trim();
		if (trailing.length > 0) {
			failParse(
				`Unexpected tokens after endeach: '${trailing}'`,
				line,
				column,
				templatePath,
			);
		}
		return Object.freeze({ kind: "BlockClose", closes: "Each", line, column });
	}

	if (keyword === "else") {
		const trailing = raw.slice(afterKeyword).trim();
		if (trailing.length > 0) {
			failInvalidExpression(
				`Unexpected tokens after else: '${trailing}' — '{% else if %}' chains are not supported, use nested {% if %}/{% else %}/{% endif %}`,
				line,
				column,
				templatePath,
			);
		}
		return Object.freeze({ kind: "Else", line, column });
	}

	if (keyword === "component") {
		return parseComponentTag(
			raw,
			line,
			column,
			templatePath,
			afterKeyword,
			helpers,
		);
	}

	failUnknownDirective(keyword, line, column, templatePath);
}
