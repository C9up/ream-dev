import { InkerRenderError } from "./InkerRenderError.js";

const IDENT_START_RE = /[a-zA-Z_$]/;
const IDENT_CONT_RE = /[a-zA-Z0-9_$]/;
const DIGIT_RE = /[0-9]/;

function failParse(
	expression: string,
	reason: string,
	line: number,
	column: number,
	offset: number,
): never {
	throw new InkerRenderError(
		"E_INKER_PARSE_ERROR",
		`Expression '${expression}' is not a member path: ${reason} (at character ${offset + 1} of the expression). Inker 53.1 only supports dot and bracket access — JS expressions arrive in 53.4. At line ${line}, column ${column}.`,
		{ line, column, expression },
	);
}

function readBracketString(
	expression: string,
	start: number,
	quote: '"' | "'",
	line: number,
	column: number,
): { value: string; next: number } {
	let i = start;
	let out = "";
	while (i < expression.length) {
		const c = expression[i];
		if (c === "\\") {
			const next = expression[i + 1];
			if (next === undefined) {
				failParse(
					expression,
					"unterminated escape inside bracket-string",
					line,
					column,
					i,
				);
			}
			if (next === quote || next === "\\") {
				out += next;
				i += 2;
				continue;
			}
			failParse(
				expression,
				`unsupported escape sequence '\\${next}' inside bracket-string (only \\${quote} and \\\\ allowed)`,
				line,
				column,
				i,
			);
		}
		if (c === quote) {
			return { value: out, next: i + 1 };
		}
		out += c;
		i += 1;
	}
	return failParse(expression, "unterminated bracket-string", line, column, i);
}

export function parsePath(
	expression: string,
	line: number,
	column: number,
): ReadonlyArray<string | number> {
	if (expression.length === 0) {
		failParse(expression, "empty path", line, column, 0);
	}

	const segments: Array<string | number> = [];
	let i = 0;

	// Helper to ensure an identifier at the current position.
	const requireIdent = (): string => {
		const start = i;
		const first = expression[i];
		if (first === undefined || !IDENT_START_RE.test(first)) {
			failParse(
				expression,
				`expected identifier at offset ${i}`,
				line,
				column,
				i,
			);
		}
		i += 1;
		while (i < expression.length && IDENT_CONT_RE.test(expression[i] ?? "")) {
			i += 1;
		}
		return expression.slice(start, i);
	};

	segments.push(requireIdent());

	while (i < expression.length) {
		const ch = expression[i];

		if (ch === ".") {
			if (i + 1 >= expression.length) {
				failParse(
					expression,
					"trailing dot with no identifier",
					line,
					column,
					i,
				);
			}
			if (expression[i + 1] === ".") {
				failParse(expression, "adjacent dots", line, column, i);
			}
			// Optional chaining `?.` — the operator scan also catches the leading `?`
			// in `a?.b`; the explicit check covers `.?` which would otherwise slip.
			if (expression[i + 1] === "?") {
				failParse(
					expression,
					"optional chaining (?.) is not supported in 53.1",
					line,
					column,
					i,
				);
			}
			i += 1;
			segments.push(requireIdent());
			continue;
		}

		if (ch === "[") {
			i += 1;
			const inner = expression[i];
			if (inner === undefined) {
				failParse(expression, "unterminated bracket access", line, column, i);
			}
			if (inner === '"' || inner === "'") {
				const { value, next } = readBracketString(
					expression,
					i + 1,
					inner,
					line,
					column,
				);
				i = next;
				if (expression[i] !== "]") {
					failParse(
						expression,
						"expected ']' after bracket-string",
						line,
						column,
						i,
					);
				}
				i += 1;
				segments.push(value);
				continue;
			}
			if (DIGIT_RE.test(inner)) {
				const start = i;
				while (i < expression.length && DIGIT_RE.test(expression[i] ?? "")) {
					i += 1;
				}
				const digits = expression.slice(start, i);
				const nextCh = expression[i];
				if (nextCh === ".") {
					failParse(
						expression,
						"float index — only non-negative integers allowed in bracket access",
						line,
						column,
						i,
					);
				}
				if (nextCh !== "]") {
					failParse(
						expression,
						`expected ']' after numeric index, got '${nextCh ?? "EOF"}'`,
						line,
						column,
						i,
					);
				}
				// Reject leading zeros (`items[007]` silently decoding to 7 hides
				// authoring mistakes — was it meant to be octal? typo? Surface it).
				if (digits.length > 1 && digits[0] === "0") {
					failParse(
						expression,
						`invalid numeric index '${digits}' — leading zeros are not allowed`,
						line,
						column,
						start,
					);
				}
				const value = Number.parseInt(digits, 10);
				if (value > Number.MAX_SAFE_INTEGER) {
					failParse(
						expression,
						`numeric index '${digits}' exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}) — precision would be silently lost`,
						line,
						column,
						start,
					);
				}
				i += 1;
				segments.push(value);
				continue;
			}
			if (inner === "-") {
				failParse(
					expression,
					"negative integer index — only non-negative integers allowed",
					line,
					column,
					i,
				);
			}
			failParse(
				expression,
				`invalid bracket content starting with '${inner}'`,
				line,
				column,
				i,
			);
		}

		// Anything else (operators, calls, ternaries, template literals, etc.)
		failParse(
			expression,
			`unexpected character '${ch}' — JS expressions arrive in 53.4`,
			line,
			column,
			i,
		);
	}

	return Object.freeze(segments);
}
