import { InkerRenderError } from "./InkerRenderError.js";

export type Token =
	| { kind: "TEXT"; value: string; line: number; column: number }
	| {
			kind: "INTERP_ESCAPED";
			expression: string;
			line: number;
			column: number;
			// Position of the first non-whitespace char inside the braces. Used as
			// the parseExpression base so error coordinates land on the actual
			// expression rather than the opening `{{`.
			exprLine: number;
			exprColumn: number;
	  }
	| {
			kind: "INTERP_RAW";
			expression: string;
			line: number;
			column: number;
			exprLine: number;
			exprColumn: number;
	  }
	| { kind: "BLOCK_TAG"; raw: string; line: number; column: number }
	| {
			kind: "SLOT_PLACEHOLDER";
			name: string;
			line: number;
			column: number;
	  };

export interface LexOptions {
	templatePath?: string;
}

interface Cursor {
	line: number;
	column: number;
}

const SLOT_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function advance(cursor: Cursor, ch: string): void {
	if (ch === "\n") {
		cursor.line += 1;
		cursor.column = 1;
	} else if (ch === "\r") {
		// CR is invisible to position tracking; a following LF resets the line.
		// Lone CR (classic-Mac) collapses all subsequent text onto its line.
	} else {
		cursor.column += 1;
	}
}

export function lex(source: string, options: LexOptions = {}): Token[] {
	const tokens: Token[] = [];
	const cursor: Cursor = { line: 1, column: 1 };
	let i = 0;

	let textStart = { line: cursor.line, column: cursor.column };
	let textBuf = "";

	const flushText = (): void => {
		if (textBuf.length > 0) {
			tokens.push({
				kind: "TEXT",
				value: textBuf,
				line: textStart.line,
				column: textStart.column,
			});
			textBuf = "";
		}
		textStart = { line: cursor.line, column: cursor.column };
	};

	while (i < source.length) {
		const ch = source[i];

		// Backslash escapes for {{, }}, {%, %}
		if (ch === "\\" && i + 2 < source.length) {
			const next = source[i + 1];
			const after = source[i + 2];
			if (next === "{" && after === "{") {
				textBuf += "{{";
				advance(cursor, "\\");
				advance(cursor, "{");
				advance(cursor, "{");
				i += 3;
				continue;
			}
			if (next === "}" && after === "}") {
				textBuf += "}}";
				advance(cursor, "\\");
				advance(cursor, "}");
				advance(cursor, "}");
				i += 3;
				continue;
			}
			if (next === "{" && after === "%") {
				textBuf += "{%";
				advance(cursor, "\\");
				advance(cursor, "{");
				advance(cursor, "%");
				i += 3;
				continue;
			}
			if (next === "%" && after === "}") {
				textBuf += "%}";
				advance(cursor, "\\");
				advance(cursor, "%");
				advance(cursor, "}");
				i += 3;
				continue;
			}
		}

		// Block-tag open: {% ... %}
		if (ch === "{" && source[i + 1] === "%") {
			flushText();
			const openLine = cursor.line;
			const openColumn = cursor.column;

			advance(cursor, "{");
			advance(cursor, "%");
			i += 2;

			let inner = "";
			let closed = false;
			let stringDelim: '"' | "'" | null = null;
			while (i < source.length) {
				const c = source[i];
				if (stringDelim === null) {
					if (c === "%" && source[i + 1] === "}") {
						advance(cursor, "%");
						advance(cursor, "}");
						i += 2;
						closed = true;
						break;
					}
					if (c === '"' || c === "'") {
						stringDelim = c;
					}
				} else {
					if (c === "\\" && i + 1 < source.length) {
						const escNext = source[i + 1] ?? "";
						inner += c;
						inner += escNext;
						advance(cursor, c);
						advance(cursor, escNext);
						i += 2;
						continue;
					}
					if (c === stringDelim) {
						stringDelim = null;
					}
				}
				inner += c;
				advance(cursor, c);
				i += 1;
			}

			if (!closed) {
				throw new InkerRenderError(
					"E_INKER_UNCLOSED_BLOCK_TAG",
					`Unclosed block tag at line ${openLine}, column ${openColumn}`,
					{
						line: openLine,
						column: openColumn,
						templatePath: options.templatePath,
					},
				);
			}

			const raw = inner.trim();
			if (raw.length === 0) {
				throw new InkerRenderError(
					"E_INKER_PARSE_ERROR",
					`Empty block tag at line ${openLine}, column ${openColumn}`,
					{
						line: openLine,
						column: openColumn,
						templatePath: options.templatePath,
					},
				);
			}

			tokens.push({
				kind: "BLOCK_TAG",
				raw,
				line: openLine,
				column: openColumn,
			});

			textStart = { line: cursor.line, column: cursor.column };
			continue;
		}

		// Interpolation open: {{ ... }} or {{{ ... }}} or slot {{> ... }}
		if (ch === "{" && source[i + 1] === "{") {
			flushText();
			const openLine = cursor.line;
			const openColumn = cursor.column;
			const isRaw = source[i + 2] === "{";

			// Consume opening braces
			if (isRaw) {
				advance(cursor, "{");
				advance(cursor, "{");
				advance(cursor, "{");
				i += 3;
			} else {
				advance(cursor, "{");
				advance(cursor, "{");
				i += 2;
			}

			// Slot disambiguator: first non-whitespace char inside is `>`.
			// Only applies to double-brace (not triple-brace).
			if (!isRaw) {
				let probe = i;
				while (probe < source.length) {
					const pc = source[probe];
					if (pc === " " || pc === "\t" || pc === "\n" || pc === "\r") {
						probe += 1;
						continue;
					}
					break;
				}
				if (source[probe] === ">") {
					// Advance cursor across the leading whitespace AND the `>`.
					// probe ≤ source.length and i < probe, so source[i] is always defined.
					while (i < probe) {
						advance(cursor, source.charAt(i));
						i += 1;
					}
					advance(cursor, ">");
					i += 1;

					let nameInner = "";
					let slotClosed = false;
					while (i < source.length) {
						const sc = source[i];
						if (sc === "}" && source[i + 1] === "}") {
							if (source[i + 2] === "}") {
								throw new InkerRenderError(
									"E_INKER_UNCLOSED_INTERPOLATION",
									`Asymmetric slot braces at line ${openLine}, column ${openColumn}`,
									{
										line: openLine,
										column: openColumn,
										templatePath: options.templatePath,
									},
								);
							}
							advance(cursor, "}");
							advance(cursor, "}");
							i += 2;
							slotClosed = true;
							break;
						}
						nameInner += sc;
						advance(cursor, sc);
						i += 1;
					}

					if (!slotClosed) {
						throw new InkerRenderError(
							"E_INKER_UNCLOSED_INTERPOLATION",
							`Unclosed slot placeholder at line ${openLine}, column ${openColumn}`,
							{
								line: openLine,
								column: openColumn,
								templatePath: options.templatePath,
							},
						);
					}

					const slotName = nameInner.trim();
					if (slotName.length === 0) {
						throw new InkerRenderError(
							"E_INKER_PARSE_ERROR",
							`Empty slot name at line ${openLine}, column ${openColumn}`,
							{
								line: openLine,
								column: openColumn,
								templatePath: options.templatePath,
							},
						);
					}
					if (!SLOT_NAME_RE.test(slotName)) {
						throw new InkerRenderError(
							"E_INKER_PARSE_ERROR",
							`Invalid slot name '${slotName}' at line ${openLine}, column ${openColumn}`,
							{
								line: openLine,
								column: openColumn,
								templatePath: options.templatePath,
							},
						);
					}

					tokens.push({
						kind: "SLOT_PLACEHOLDER",
						name: slotName,
						line: openLine,
						column: openColumn,
					});

					textStart = { line: cursor.line, column: cursor.column };
					continue;
				}
			}

			// Triple-brace + `>` is rejected (slot must use double braces).
			if (isRaw) {
				let probe = i;
				while (probe < source.length) {
					const pc = source[probe];
					if (pc === " " || pc === "\t" || pc === "\n" || pc === "\r") {
						probe += 1;
						continue;
					}
					break;
				}
				if (source[probe] === ">") {
					throw new InkerRenderError(
						"E_INKER_PARSE_ERROR",
						`Slot placeholder must use double braces; got triple-brace form at line ${openLine}, column ${openColumn}`,
						{
							line: openLine,
							column: openColumn,
							templatePath: options.templatePath,
						},
					);
				}
			}

			// Scan inner expression until matching close.
			// String-aware: `}}` / `}}}` inside quoted string literals do NOT close
			// the interpolation. Backslash-escapes inside strings consume the next
			// char verbatim (decoding happens in parseExpression, not here).
			// Position tracking: capture (exprLine, exprColumn) at the first
			// non-whitespace char so parseExpression's error coordinates align
			// with the trimmed expression source (instead of pointing at `{{`).
			let inner = "";
			let closed = false;
			let stringDelim: '"' | "'" | null = null;
			let exprLine = cursor.line;
			let exprColumn = cursor.column;
			let exprStartFound = false;
			while (i < source.length) {
				const c = source[i];
				if (stringDelim === null) {
					if (isRaw) {
						if (c === "}" && source[i + 1] === "}" && source[i + 2] === "}") {
							advance(cursor, "}");
							advance(cursor, "}");
							advance(cursor, "}");
							i += 3;
							closed = true;
							break;
						}
						// Detect asymmetric close: `}}` immediately followed by a non-`}` char
						if (c === "}" && source[i + 1] === "}") {
							throw new InkerRenderError(
								"E_INKER_UNCLOSED_INTERPOLATION",
								`Unclosed triple-brace interpolation at line ${openLine}, column ${openColumn}`,
								{
									line: openLine,
									column: openColumn,
									templatePath: options.templatePath,
								},
							);
						}
					} else {
						if (c === "}" && source[i + 1] === "}") {
							// If a third `}` follows, that is an asymmetric close
							if (source[i + 2] === "}") {
								throw new InkerRenderError(
									"E_INKER_UNCLOSED_INTERPOLATION",
									`Asymmetric interpolation braces at line ${openLine}, column ${openColumn}`,
									{
										line: openLine,
										column: openColumn,
										templatePath: options.templatePath,
									},
								);
							}
							advance(cursor, "}");
							advance(cursor, "}");
							i += 2;
							closed = true;
							break;
						}
					}
					if (c === '"' || c === "'") {
						stringDelim = c;
					}
					if (
						!exprStartFound &&
						c !== " " &&
						c !== "\t" &&
						c !== "\n" &&
						c !== "\r"
					) {
						exprLine = cursor.line;
						exprColumn = cursor.column;
						exprStartFound = true;
					}
				} else {
					if (c === "\\" && i + 1 < source.length) {
						const escNext = source[i + 1] ?? "";
						inner += c;
						inner += escNext;
						advance(cursor, c);
						advance(cursor, escNext);
						i += 2;
						continue;
					}
					if (c === stringDelim) {
						stringDelim = null;
					}
				}
				inner += c;
				advance(cursor, c);
				i += 1;
			}

			if (!closed) {
				throw new InkerRenderError(
					"E_INKER_UNCLOSED_INTERPOLATION",
					`Unclosed interpolation at line ${openLine}, column ${openColumn}`,
					{
						line: openLine,
						column: openColumn,
						templatePath: options.templatePath,
					},
				);
			}

			const expression = inner.trim();
			if (expression.length === 0) {
				throw new InkerRenderError(
					"E_INKER_PARSE_ERROR",
					`Empty interpolation at line ${openLine}, column ${openColumn}`,
					{
						line: openLine,
						column: openColumn,
						templatePath: options.templatePath,
					},
				);
			}

			tokens.push({
				kind: isRaw ? "INTERP_RAW" : "INTERP_ESCAPED",
				expression,
				line: openLine,
				column: openColumn,
				exprLine,
				exprColumn,
			});

			textStart = { line: cursor.line, column: cursor.column };
			continue;
		}

		textBuf += ch;
		advance(cursor, ch);
		i += 1;
	}

	flushText();
	return tokens;
}
