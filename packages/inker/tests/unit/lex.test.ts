import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

describe("lex", () => {
	it("emits a single TEXT token for plain text", () => {
		const tokens = lex("hello world");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "TEXT",
			value: "hello world",
			line: 1,
			column: 1,
		});
	});

	it("recognises {{ x }} as INTERP_ESCAPED", () => {
		const tokens = lex("{{ x }}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: "x",
			line: 1,
			column: 1,
		});
	});

	it("recognises {{{ x }}} as INTERP_RAW", () => {
		const tokens = lex("{{{ x }}}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_RAW",
			expression: "x",
			line: 1,
			column: 1,
		});
	});

	it("trims inner whitespace around the expression", () => {
		const tokens = lex("{{   x   }}");
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: "x",
		});
	});

	it("preserves verbatim whitespace OUTSIDE braces", () => {
		const source = "before\n\t  {{ x }}\n\tafter";
		const tokens = lex(source);
		expect(tokens).toHaveLength(3);
		expect(tokens[0]).toMatchObject({ kind: "TEXT", value: "before\n\t  " });
		expect(tokens[1]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: "x",
		});
		expect(tokens[2]).toMatchObject({ kind: "TEXT", value: "\n\tafter" });
	});

	it("decodes \\{{ and \\}} as literal braces inside TEXT", () => {
		const tokens = lex("\\{{ literal \\}}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "TEXT",
			value: "{{ literal }}",
		});
	});

	it("throws E_INKER_PARSE_ERROR on empty interpolation {{}}", () => {
		try {
			lex("{{}}");
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.context.line).toBe(1);
			expect(err.context.column).toBe(1);
		}
	});

	it("throws E_INKER_UNCLOSED_INTERPOLATION on asymmetric {{ x }}}", () => {
		try {
			lex("{{ x }}}");
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_UNCLOSED_INTERPOLATION",
			);
		}
	});

	it("throws E_INKER_UNCLOSED_INTERPOLATION on asymmetric {{{ x }}", () => {
		try {
			lex("{{{ x }}");
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_UNCLOSED_INTERPOLATION",
			);
		}
	});

	it("throws E_INKER_UNCLOSED_INTERPOLATION with OPEN brace position on EOF mid-interp", () => {
		try {
			lex("prelude {{ x");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNCLOSED_INTERPOLATION");
			expect(err.context.line).toBe(1);
			expect(err.context.column).toBe(9);
		}
	});

	it("tracks newlines correctly for multi-line input", () => {
		const tokens = lex("\n\n{{ x }}");
		expect(tokens).toHaveLength(2);
		expect(tokens[0]).toMatchObject({ kind: "TEXT", value: "\n\n" });
		expect(tokens[1]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: "x",
			line: 3,
			column: 1,
		});
	});

	// --- 53.2 block tags ---

	it("emits BLOCK_TAG for {% layout 'main' %}", () => {
		const tokens = lex("{% layout 'main' %}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "BLOCK_TAG",
			raw: "layout 'main'",
			line: 1,
			column: 1,
		});
	});

	it("emits BLOCK_TAG for {% include 'partials/header' %}", () => {
		const tokens = lex("{% include 'partials/header' %}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "BLOCK_TAG",
			raw: "include 'partials/header'",
		});
	});

	it("emits BLOCK_TAG then TEXT for {% layout 'main' %} followed by text", () => {
		const tokens = lex("{% layout 'main' %}hello");
		expect(tokens).toHaveLength(2);
		expect(tokens[0]?.kind).toBe("BLOCK_TAG");
		expect(tokens[1]).toMatchObject({ kind: "TEXT", value: "hello" });
	});

	it("accepts multi-line block tag and pins position to the OPEN {%", () => {
		const tokens = lex("{% layout\n  'main'\n%}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "BLOCK_TAG",
			raw: "layout\n  'main'",
			line: 1,
			column: 1,
		});
	});

	it("decodes \\{% and \\%} as literal braces inside TEXT", () => {
		const tokens = lex("\\{% layout 'main' \\%}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "TEXT",
			value: "{% layout 'main' %}",
		});
	});

	it("throws E_INKER_UNCLOSED_BLOCK_TAG on EOF before %}", () => {
		try {
			lex("{% layout 'main'");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNCLOSED_BLOCK_TAG");
			expect(err.context.line).toBe(1);
			expect(err.context.column).toBe(1);
		}
	});

	it("throws E_INKER_PARSE_ERROR on empty block tag {%%}", () => {
		try {
			lex("{%%}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("Empty block tag");
		}
	});

	it("throws E_INKER_PARSE_ERROR on empty block tag {% %}", () => {
		try {
			lex("{% %}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("Empty block tag");
		}
	});

	// --- 53.2 slot placeholders ---

	it("emits SLOT_PLACEHOLDER for {{> body }}", () => {
		const tokens = lex("{{> body }}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "SLOT_PLACEHOLDER",
			name: "body",
			line: 1,
			column: 1,
		});
	});

	it("emits SLOT_PLACEHOLDER for {{>body}} (no whitespace)", () => {
		const tokens = lex("{{>body}}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "SLOT_PLACEHOLDER",
			name: "body",
		});
	});

	it("emits SLOT_PLACEHOLDER for {{  >  body  }} (whitespace around >)", () => {
		const tokens = lex("{{  >  body  }}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "SLOT_PLACEHOLDER",
			name: "body",
		});
	});

	it("falls through to INTERP_ESCAPED when {{ is not followed by >", () => {
		const tokens = lex("{{ x }}");
		expect(tokens[0]?.kind).toBe("INTERP_ESCAPED");
	});

	it("triple-brace WITHOUT > is INTERP_RAW", () => {
		const tokens = lex("{{{ x }}}");
		expect(tokens[0]?.kind).toBe("INTERP_RAW");
	});

	it("throws on triple-brace + > ({{{> body }}})", () => {
		try {
			lex("{{{> body }}}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("triple-brace");
		}
	});

	it("throws on empty slot name {{>}}", () => {
		try {
			lex("{{>}}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("Empty slot name");
		}
	});

	it("throws on empty slot name {{> }}", () => {
		try {
			lex("{{> }}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("Empty slot name");
		}
	});

	it("throws on invalid slot name {{> 1bad }} (starts with digit)", () => {
		try {
			lex("{{> 1bad }}");
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("1bad");
		}
	});

	it("accepts kebab slot name {{> page-body }}", () => {
		const tokens = lex("{{> page-body }}");
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "SLOT_PLACEHOLDER",
			name: "page-body",
		});
	});

	// --- 53.3 control-flow + component lexing (BLOCK_TAG kind is reused) ---

	describe("53.3 control-flow keywords", () => {
		it("lexes {% if x %} as BLOCK_TAG with raw `if x`", () => {
			const tokens = lex("{% if x %}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "if x", line: 1, column: 1 },
			]);
		});

		it("lexes {% else %} as BLOCK_TAG with raw `else`", () => {
			const tokens = lex("{% else %}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "else", line: 1, column: 1 },
			]);
		});

		it("lexes {% endif %} as BLOCK_TAG with raw `endif`", () => {
			const tokens = lex("{% endif %}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "endif", line: 1, column: 1 },
			]);
		});

		it("lexes {% each items as item %} as BLOCK_TAG", () => {
			const tokens = lex("{% each items as item %}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "each items as item", line: 1, column: 1 },
			]);
		});

		it("lexes {% endeach %} as BLOCK_TAG", () => {
			const tokens = lex("{% endeach %}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "endeach", line: 1, column: 1 },
			]);
		});

		it("lexes {% component 'card' { title: x } %} as BLOCK_TAG", () => {
			const tokens = lex("{% component 'card' { title: x } %}");
			expect(tokens[0]).toMatchObject({
				kind: "BLOCK_TAG",
				raw: "component 'card' { title: x }",
			});
		});

		it("preserves whitespace tolerance — `{%if x%}`", () => {
			const tokens = lex("{%if x%}");
			expect(tokens).toEqual([
				{ kind: "BLOCK_TAG", raw: "if x", line: 1, column: 1 },
			]);
		});

		it("preserves whitespace tolerance — multiline `{%  if\\nx  %}`", () => {
			const tokens = lex("{%\n  if\n  x\n  %}");
			expect(tokens[0]?.kind).toBe("BLOCK_TAG");
			if (tokens[0]?.kind === "BLOCK_TAG") {
				expect(tokens[0].raw).toBe("if\n  x");
			}
		});

		it("preserves \\r\\n line endings inside the raw inner", () => {
			const tokens = lex("{% if\r\nx %}");
			expect(tokens[0]?.kind).toBe("BLOCK_TAG");
		});

		it("tab-indented `{%\\tif x\\t%}`", () => {
			const tokens = lex("{%\tif x\t%}");
			expect(tokens[0]).toMatchObject({
				kind: "BLOCK_TAG",
				raw: "if x",
			});
		});

		it("freestanding {% else %} lexes fine (parser context decides legality)", () => {
			const tokens = lex("before {% else %} after");
			expect(tokens.map((t) => t.kind)).toEqual(["TEXT", "BLOCK_TAG", "TEXT"]);
		});

		it("multiple block tags emit separate BLOCK_TAG tokens", () => {
			const tokens = lex(
				"{% if x %}a{% else %}b{% endif %}{% each i as j %}c{% endeach %}",
			);
			expect(tokens.map((t) => t.kind)).toEqual([
				"BLOCK_TAG",
				"TEXT",
				"BLOCK_TAG",
				"TEXT",
				"BLOCK_TAG",
				"BLOCK_TAG",
				"TEXT",
				"BLOCK_TAG",
			]);
		});
	});
});
