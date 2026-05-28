import { InkerRenderError } from "./InkerRenderError.js";
import {
	PROTOTYPE_POLLUTION_KEYS,
	RESERVED_BINDING_NAMES,
} from "./identifierGuards.js";
import { parsePath } from "./parsePath.js";

export type BinaryOp =
	| "=="
	| "!="
	| "==="
	| "!=="
	| "<"
	| "<="
	| ">"
	| ">="
	| "&&"
	| "||";

export type LiteralValue = string | number | boolean | null | undefined;

export interface LiteralExpression {
	readonly kind: "Literal";
	readonly value: LiteralValue;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface PathExpression {
	readonly kind: "Path";
	readonly path: ReadonlyArray<string | number>;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface CallExpression {
	readonly kind: "Call";
	readonly name: string;
	readonly args: readonly Expression[];
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface ObjectEntry {
	readonly key: string;
	readonly value: Expression;
	readonly shorthand: boolean;
}

export interface ObjectExpression {
	readonly kind: "Object";
	readonly entries: readonly ObjectEntry[];
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface UnaryExpression {
	readonly kind: "Unary";
	readonly op: "!";
	readonly operand: Expression;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface BinaryExpression {
	readonly kind: "Binary";
	readonly op: BinaryOp;
	readonly left: Expression;
	readonly right: Expression;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface GroupExpression {
	readonly kind: "Group";
	readonly expression: Expression;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export type Expression =
	| LiteralExpression
	| PathExpression
	| CallExpression
	| ObjectExpression
	| UnaryExpression
	| BinaryExpression
	| GroupExpression;

export interface ParseExpressionOptions {
	readonly templatePath?: string;
	readonly helpers?: ReadonlySet<string>;
}

const IDENT_START_RE = /[a-zA-Z_$]/;
const IDENT_CONT_RE = /[a-zA-Z0-9_$]/;
const DIGIT_RE = /[0-9]/;

const LITERAL_KEYWORDS: ReadonlySet<string> = new Set([
	"true",
	"false",
	"null",
	"undefined",
]);

interface Cursor {
	readonly source: string;
	pos: number;
	readonly baseLine: number;
	readonly baseColumn: number;
	readonly templatePath?: string;
	readonly helpers: ReadonlySet<string>;
	// P3: tracks current recursion depth across parsePrimary entries.
	// Incremented at the top of parsePrimary, decremented in a `finally`
	// block at exit. A typed `E_INKER_PARSE_ERROR` fires before the JS
	// engine raises a `RangeError`, keeping the contract that every
	// parse-time failure carries an Inker error code.
	depth: number;
}

// P3: recursion bound for `parsePrimary` chains. Realistic templates rarely
// nest expressions deeper than a handful; 256 absorbs any legitimate use
// (deeply chained binary ops, nested object literals) while stopping
// pathological input long before V8's stack ceiling.
const MAX_EXPRESSION_DEPTH = 256;

function makeCursor(
	source: string,
	line: number,
	column: number,
	options: ParseExpressionOptions,
): Cursor {
	return {
		source,
		pos: 0,
		baseLine: line,
		baseColumn: column,
		templatePath: options.templatePath,
		helpers: options.helpers ?? new Set(),
		depth: 0,
	};
}

function positionAt(
	cursor: Cursor,
	offset: number,
): { readonly line: number; readonly column: number } {
	let line = cursor.baseLine;
	let column = cursor.baseColumn;
	const end = Math.min(offset, cursor.source.length);
	for (let i = 0; i < end; i += 1) {
		const c = cursor.source[i];
		if (c === "\n") {
			line += 1;
			column = 1;
		} else if (c === "\r") {
			// CR is invisible — a following LF performs the line break.
		} else {
			column += 1;
		}
	}
	return { line, column };
}

function failParse(cursor: Cursor, reason: string, offset = cursor.pos): never {
	const { line, column } = positionAt(cursor, offset);
	throw new InkerRenderError(
		"E_INKER_PARSE_ERROR",
		`Expression '${cursor.source}': ${reason} (at character ${offset + 1} of the expression). At line ${line}, column ${column}.`,
		{
			line,
			column,
			expression: cursor.source,
			templatePath: cursor.templatePath,
		},
	);
}

function failInvalidExpression(
	cursor: Cursor,
	reason: string,
	offset = cursor.pos,
): never {
	const { line, column } = positionAt(cursor, offset);
	throw new InkerRenderError(
		"E_INKER_INVALID_EXPRESSION",
		`Expression '${cursor.source}': ${reason} (at character ${offset + 1} of the expression). At line ${line}, column ${column}.`,
		{
			line,
			column,
			expression: cursor.source,
			templatePath: cursor.templatePath,
		},
	);
}

function failUnknownHelper(
	cursor: Cursor,
	name: string,
	offset: number,
): never {
	const { line, column } = positionAt(cursor, offset);
	const registered = Array.from(cursor.helpers).sort();
	const shown = registered.slice(0, 5).join(", ");
	const overflow = registered.length > 5 ? ", …" : "";
	const hint =
		registered.length === 0
			? "no helpers are registered"
			: `registered helpers: ${shown}${overflow}`;
	throw new InkerRenderError(
		"E_INKER_UNKNOWN_HELPER",
		`Unknown helper '${name}' at line ${line}, column ${column} — ${hint}`,
		{
			line,
			column,
			expression: name,
			templatePath: cursor.templatePath,
		},
	);
}

function skipWhitespace(cursor: Cursor): void {
	while (cursor.pos < cursor.source.length) {
		const c = cursor.source[cursor.pos];
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			cursor.pos += 1;
			continue;
		}
		break;
	}
}

function readIdentifier(cursor: Cursor): string {
	const start = cursor.pos;
	const first = cursor.source[cursor.pos];
	if (first === undefined || !IDENT_START_RE.test(first)) {
		failParse(cursor, "expected identifier");
	}
	cursor.pos += 1;
	while (
		cursor.pos < cursor.source.length &&
		IDENT_CONT_RE.test(cursor.source[cursor.pos] ?? "")
	) {
		cursor.pos += 1;
	}
	return cursor.source.slice(start, cursor.pos);
}

function readStringLiteral(cursor: Cursor, quote: "'" | '"'): string {
	let out = "";
	cursor.pos += 1; // consume opening quote
	while (cursor.pos < cursor.source.length) {
		const c = cursor.source[cursor.pos];
		if (c === "\\") {
			const next = cursor.source[cursor.pos + 1];
			if (next === undefined) {
				failParse(cursor, "unterminated escape inside string literal");
			}
			switch (next) {
				case "n":
					out += "\n";
					break;
				case "t":
					out += "\t";
					break;
				case "\\":
					out += "\\";
					break;
				case "'":
					out += "'";
					break;
				case '"':
					out += '"';
					break;
				default:
					failParse(
						cursor,
						`unsupported escape sequence '\\${next}' inside string literal (only \\n, \\t, \\\\, \\', \\" allowed)`,
					);
			}
			cursor.pos += 2;
			continue;
		}
		if (c === quote) {
			cursor.pos += 1;
			return out;
		}
		if (c === undefined) {
			break;
		}
		out += c;
		cursor.pos += 1;
	}
	return failParse(cursor, "unterminated string literal");
}

function readNumberLiteralSource(cursor: Cursor): string {
	const start = cursor.pos;
	if (cursor.source[cursor.pos] === "-") {
		cursor.pos += 1;
	}
	if (
		cursor.pos >= cursor.source.length ||
		!DIGIT_RE.test(cursor.source[cursor.pos] ?? "")
	) {
		failParse(cursor, "expected digit after '-' in number literal", start);
	}
	while (
		cursor.pos < cursor.source.length &&
		DIGIT_RE.test(cursor.source[cursor.pos] ?? "")
	) {
		cursor.pos += 1;
	}
	if (cursor.source[cursor.pos] === ".") {
		cursor.pos += 1;
		const fracStart = cursor.pos;
		while (
			cursor.pos < cursor.source.length &&
			DIGIT_RE.test(cursor.source[cursor.pos] ?? "")
		) {
			cursor.pos += 1;
		}
		if (cursor.pos === fracStart) {
			failParse(cursor, "expected digit after '.' in number literal");
		}
	}
	const next = cursor.source[cursor.pos];
	if (next === ".") {
		failParse(cursor, "invalid number literal — multiple dots");
	}
	if (next !== undefined && /[a-zA-Z_$]/.test(next)) {
		failParse(
			cursor,
			"invalid number literal — only integer and decimal forms supported (no exponent / hex / octal / binary / BigInt)",
		);
	}
	return cursor.source.slice(start, cursor.pos);
}

// Reject literals whose magnitude exceeds Number.MAX_SAFE_INTEGER so that
// authors writing `{{ id == 9007199254740993 }}` against a 64-bit DB column
// don't silently match the wrong row through JS float-coercion. parseFloat
// silently truncates; we surface the loss instead.
function validateNumberMagnitude(
	cursor: Cursor,
	source: string,
	value: number,
	startOffset: number,
): void {
	if (!Number.isFinite(value)) {
		failParse(
			cursor,
			`invalid number literal '${source}' — not a finite number`,
			startOffset,
		);
	}
	if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
		failParse(
			cursor,
			`number literal '${source}' exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}) — comparisons would silently lose precision`,
			startOffset,
		);
	}
}

/**
 * Scan from the cursor forwards through any `.identifier` / `[…]`
 * segments and return the position AFTER the last consumed segment.
 * The cursor itself is NOT moved. Handles bracket-strings and nested
 * brackets via depth counting.
 */
function scanPathTail(cursor: Cursor): number {
	let i = cursor.pos;
	while (i < cursor.source.length) {
		const c = cursor.source[i];
		if (c === ".") {
			if (cursor.source[i + 1] === ".") break;
			i += 1;
			while (
				i < cursor.source.length &&
				IDENT_CONT_RE.test(cursor.source[i] ?? "")
			) {
				i += 1;
			}
			continue;
		}
		if (c === "[") {
			const bracketOpenOffset = i;
			let depth = 1;
			i += 1;
			while (i < cursor.source.length && depth > 0) {
				const cc = cursor.source[i];
				if (cc === '"' || cc === "'") {
					const quote = cc;
					i += 1;
					while (i < cursor.source.length) {
						const ic = cursor.source[i];
						if (ic === "\\") {
							i += 2;
							continue;
						}
						if (ic === quote) {
							i += 1;
							break;
						}
						i += 1;
					}
					continue;
				}
				if (cc === "[") depth += 1;
				else if (cc === "]") depth -= 1;
				i += 1;
			}
			if (depth > 0) {
				failParse(
					cursor,
					"unterminated '[' in path expression",
					bracketOpenOffset,
				);
			}
			continue;
		}
		break;
	}
	return i;
}

function parsePrimary(cursor: Cursor): Expression {
	// P3: guard against unbounded recursion before any work happens. The
	// matching decrement lives in the `try { … } finally` wrapper below.
	cursor.depth += 1;
	if (cursor.depth > MAX_EXPRESSION_DEPTH) {
		failParse(
			cursor,
			`expression nests beyond the maximum depth of ${MAX_EXPRESSION_DEPTH} — flatten the expression or move logic to a helper`,
		);
	}
	try {
		return parsePrimaryInner(cursor);
	} finally {
		cursor.depth -= 1;
	}
}

function parsePrimaryInner(cursor: Cursor): Expression {
	skipWhitespace(cursor);
	const start = cursor.pos;
	const startPos = positionAt(cursor, start);
	const c = cursor.source[cursor.pos];

	if (c === undefined) {
		failParse(cursor, "unexpected end of expression");
	}

	if (c === "'" || c === '"') {
		const value = readStringLiteral(cursor, c);
		return Object.freeze({
			kind: "Literal",
			value,
			source: cursor.source.slice(start, cursor.pos),
			line: startPos.line,
			column: startPos.column,
		});
	}

	if (c === "-") {
		const next = cursor.source[cursor.pos + 1];
		if (next !== undefined && DIGIT_RE.test(next)) {
			const source = readNumberLiteralSource(cursor);
			const value = Number.parseFloat(source);
			validateNumberMagnitude(cursor, source, value, start);
			return Object.freeze({
				kind: "Literal",
				value,
				source,
				line: startPos.line,
				column: startPos.column,
			});
		}
		failParse(
			cursor,
			"unary minus is not supported — use a numeric literal or a path",
		);
	}

	if (DIGIT_RE.test(c)) {
		const source = readNumberLiteralSource(cursor);
		const value = Number.parseFloat(source);
		validateNumberMagnitude(cursor, source, value, start);
		return Object.freeze({
			kind: "Literal",
			value,
			source,
			line: startPos.line,
			column: startPos.column,
		});
	}

	if (c === "(") {
		cursor.pos += 1;
		skipWhitespace(cursor);
		const inner = parseOr(cursor);
		skipWhitespace(cursor);
		if (cursor.source[cursor.pos] !== ")") {
			failParse(cursor, "expected ')' to close grouping");
		}
		cursor.pos += 1;
		return Object.freeze({
			kind: "Group",
			expression: inner,
			source: cursor.source.slice(start, cursor.pos),
			line: startPos.line,
			column: startPos.column,
		});
	}

	if (c === "{") {
		return parseObjectLiteral(cursor, start, startPos);
	}

	if (c === "[") {
		failParse(
			cursor,
			"array literals are not supported in expression position — they are only valid as destructuring bindings in `{% each items as [k, v] %}`",
		);
	}

	// `!` is handled exclusively by parseUnary above this layer; parsePrimary
	// is only reached after parseUnary has already stripped any leading `!`.

	if (IDENT_START_RE.test(c)) {
		const identStart = cursor.pos;
		const name = readIdentifier(cursor);

		if (LITERAL_KEYWORDS.has(name)) {
			let value: LiteralValue;
			if (name === "true") value = true;
			else if (name === "false") value = false;
			else if (name === "null") value = null;
			else value = undefined;
			return Object.freeze({
				kind: "Literal",
				value,
				source: name,
				line: startPos.line,
				column: startPos.column,
			});
		}

		// Function call — `name(` IMMEDIATELY (no whitespace between identifier
		// and `(`). `foo (a)` is rejected so that the grouping form `(expr)`
		// can never be mistaken for an arg list.
		if (cursor.source[cursor.pos] === "(") {
			if (!cursor.helpers.has(name)) {
				failUnknownHelper(cursor, name, identStart);
			}
			cursor.pos += 1;
			const args = parseCallArgs(cursor);
			return Object.freeze({
				kind: "Call",
				name,
				args,
				source: cursor.source.slice(start, cursor.pos),
				line: startPos.line,
				column: startPos.column,
			});
		}

		const pathEnd = scanPathTail(cursor);
		const pathSource = cursor.source.slice(identStart, pathEnd);
		const path = parsePath(pathSource, startPos.line, startPos.column);
		cursor.pos = pathEnd;
		return Object.freeze({
			kind: "Path",
			path,
			source: pathSource,
			line: startPos.line,
			column: startPos.column,
		});
	}

	return failParse(
		cursor,
		`unexpected character '${c}' at start of expression`,
	);
}

function parseCallArgs(cursor: Cursor): readonly Expression[] {
	const args: Expression[] = [];
	skipWhitespace(cursor);
	if (cursor.source[cursor.pos] === ")") {
		cursor.pos += 1;
		return Object.freeze(args);
	}
	while (true) {
		skipWhitespace(cursor);
		const here = cursor.source[cursor.pos];
		if (here === ",") {
			failParse(cursor, "unexpected ',' — empty argument position");
		}
		if (here === ")") {
			failParse(
				cursor,
				"unexpected ')' — trailing comma is not allowed in call args",
			);
		}
		args.push(parseOr(cursor));
		skipWhitespace(cursor);
		const next = cursor.source[cursor.pos];
		if (next === ",") {
			cursor.pos += 1;
			continue;
		}
		if (next === ")") {
			cursor.pos += 1;
			return Object.freeze(args);
		}
		failParse(
			cursor,
			`expected ',' or ')' in call arguments, got '${next ?? "EOF"}'`,
		);
	}
}

function parseObjectLiteral(
	cursor: Cursor,
	start: number,
	startPos: { readonly line: number; readonly column: number },
): ObjectExpression {
	cursor.pos += 1; // consume `{`
	const entries: ObjectEntry[] = [];
	const seenKeys = new Set<string>();
	skipWhitespace(cursor);

	if (cursor.source[cursor.pos] === "}") {
		cursor.pos += 1;
		return Object.freeze({
			kind: "Object",
			entries: Object.freeze(entries),
			source: cursor.source.slice(start, cursor.pos),
			line: startPos.line,
			column: startPos.column,
		});
	}

	while (true) {
		skipWhitespace(cursor);
		if (cursor.source[cursor.pos] === ",") {
			failParse(cursor, "unexpected ',' — leading comma in object literal");
		}
		const keyStart = cursor.pos;
		const keyFirst = cursor.source[cursor.pos];
		if (keyFirst === undefined || !IDENT_START_RE.test(keyFirst)) {
			failParse(
				cursor,
				`expected object key identifier, got '${keyFirst ?? "EOF"}'`,
			);
		}
		const key = readIdentifier(cursor);
		if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
			failInvalidExpression(
				cursor,
				`object key '${key}' is a prototype-pollution surface — forbidden`,
				keyStart,
			);
		}
		if (seenKeys.has(key)) {
			failParse(cursor, `duplicate object key '${key}'`, keyStart);
		}
		seenKeys.add(key);

		skipWhitespace(cursor);
		const after = cursor.source[cursor.pos];

		if (after === ":") {
			cursor.pos += 1;
			skipWhitespace(cursor);
			const value = parseOr(cursor);
			entries.push(Object.freeze({ key, value, shorthand: false }));
		} else if (after === "." || after === "[") {
			failParse(
				cursor,
				`object shorthand value must be a bare identifier — dotted/bracket paths require explicit 'key: path' (key was '${key}')`,
				keyStart,
			);
		} else if (after === "," || after === "}") {
			// Reject `{true}` / `{undefined}` / `{as}` shorthand — without this
			// guard they silently desugar to `Path(["true"])` and resolve
			// `data.true`, shadowing both the literal keyword and the
			// grammar-reserved binding name.
			if (LITERAL_KEYWORDS.has(key) || RESERVED_BINDING_NAMES.has(key)) {
				failInvalidExpression(
					cursor,
					`object shorthand '${key}' shadows a literal/reserved keyword — use 'key: value' explicitly`,
					keyStart,
				);
			}
			const keyPos = positionAt(cursor, keyStart);
			entries.push(
				Object.freeze({
					key,
					value: Object.freeze({
						kind: "Path",
						path: Object.freeze([key]),
						source: key,
						line: keyPos.line,
						column: keyPos.column,
					}),
					shorthand: true,
				}),
			);
		} else {
			failParse(
				cursor,
				`expected ':' or ',' or '}' after object key '${key}', got '${after ?? "EOF"}'`,
			);
		}

		skipWhitespace(cursor);
		const sep = cursor.source[cursor.pos];
		if (sep === ",") {
			cursor.pos += 1;
			skipWhitespace(cursor);
			if (cursor.source[cursor.pos] === "}") {
				cursor.pos += 1;
				return Object.freeze({
					kind: "Object",
					entries: Object.freeze(entries),
					source: cursor.source.slice(start, cursor.pos),
					line: startPos.line,
					column: startPos.column,
				});
			}
			continue;
		}
		if (sep === "}") {
			cursor.pos += 1;
			return Object.freeze({
				kind: "Object",
				entries: Object.freeze(entries),
				source: cursor.source.slice(start, cursor.pos),
				line: startPos.line,
				column: startPos.column,
			});
		}
		failParse(
			cursor,
			`expected ',' or '}' in object literal, got '${sep ?? "EOF"}'`,
		);
	}
}

function parseUnary(cursor: Cursor): Expression {
	skipWhitespace(cursor);
	const start = cursor.pos;
	const startPos = positionAt(cursor, start);
	if (
		cursor.source[cursor.pos] === "!" &&
		cursor.source[cursor.pos + 1] !== "="
	) {
		cursor.pos += 1;
		const operand = parseUnary(cursor);
		return Object.freeze({
			kind: "Unary",
			op: "!",
			operand,
			source: cursor.source.slice(start, cursor.pos),
			line: startPos.line,
			column: startPos.column,
		});
	}
	return parsePrimary(cursor);
}

function tryReadBinaryOp(cursor: Cursor): BinaryOp | undefined {
	const c = cursor.source[cursor.pos];
	if (c === undefined) return undefined;

	if (c === "=") {
		if (cursor.source[cursor.pos + 1] === "=") {
			if (cursor.source[cursor.pos + 2] === "=") {
				cursor.pos += 3;
				return "===";
			}
			cursor.pos += 2;
			return "==";
		}
		failParse(cursor, "unexpected '=' — use '==' or '===' for equality");
	}
	if (c === "!") {
		if (cursor.source[cursor.pos + 1] === "=") {
			if (cursor.source[cursor.pos + 2] === "=") {
				cursor.pos += 3;
				return "!==";
			}
			cursor.pos += 2;
			return "!=";
		}
		return undefined;
	}
	if (c === "<") {
		if (cursor.source[cursor.pos + 1] === "=") {
			cursor.pos += 2;
			return "<=";
		}
		cursor.pos += 1;
		return "<";
	}
	if (c === ">") {
		if (cursor.source[cursor.pos + 1] === "=") {
			cursor.pos += 2;
			return ">=";
		}
		cursor.pos += 1;
		return ">";
	}
	if (c === "&") {
		if (cursor.source[cursor.pos + 1] === "&") {
			cursor.pos += 2;
			return "&&";
		}
		failParse(
			cursor,
			"bitwise '&' is not supported — use '&&' for logical AND",
		);
	}
	if (c === "|") {
		if (cursor.source[cursor.pos + 1] === "|") {
			cursor.pos += 2;
			return "||";
		}
		failParse(cursor, "bitwise '|' is not supported — use '||' for logical OR");
	}
	return undefined;
}

function precedenceOf(op: BinaryOp): number {
	switch (op) {
		case "||":
			return 1;
		case "&&":
			return 2;
		case "==":
		case "!=":
		case "===":
		case "!==":
			return 3;
		case "<":
		case "<=":
		case ">":
		case ">=":
			return 4;
	}
}

function parseBinary(cursor: Cursor, minPrecedence: number): Expression {
	let left: Expression = parseUnary(cursor);
	while (true) {
		const beforeOpPos = cursor.pos;
		skipWhitespace(cursor);
		const op = tryReadBinaryOp(cursor);
		if (op === undefined) {
			cursor.pos = beforeOpPos;
			return left;
		}
		const prec = precedenceOf(op);
		if (prec < minPrecedence) {
			cursor.pos = beforeOpPos;
			return left;
		}
		const right = parseBinary(cursor, prec + 1);
		left = Object.freeze({
			kind: "Binary",
			op,
			left,
			right,
			source: `${left.source} ${op} ${right.source}`,
			line: left.line,
			column: left.column,
		});
	}
}

function parseOr(cursor: Cursor): Expression {
	return parseBinary(cursor, 1);
}

export function parseExpression(
	source: string,
	line: number,
	column: number,
	options: ParseExpressionOptions = {},
): Expression {
	if (source.length === 0) {
		throw new InkerRenderError(
			"E_INKER_PARSE_ERROR",
			`Empty expression at line ${line}, column ${column}`,
			{
				line,
				column,
				expression: source,
				templatePath: options.templatePath,
			},
		);
	}
	const cursor = makeCursor(source, line, column, options);
	skipWhitespace(cursor);
	const expr = parseOr(cursor);
	skipWhitespace(cursor);
	if (cursor.pos < cursor.source.length) {
		failParse(
			cursor,
			`trailing content after expression: '${cursor.source.slice(cursor.pos)}'`,
		);
	}
	return expr;
}
