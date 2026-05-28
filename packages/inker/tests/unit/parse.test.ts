import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse } from "../../src/parse.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

describe("parse", () => {
	it("produces a Text node for plain text", () => {
		const ast = parse(lex("hello"));
		expect(ast.nodes).toHaveLength(1);
		expect(ast.nodes[0]).toEqual({ kind: "Text", value: "hello" });
	});

	it("produces an Interpolation node for {{ a.b }} (escape=true)", () => {
		const ast = parse(lex("{{ a.b }}"));
		expect(ast.nodes).toHaveLength(1);
		expect(ast.nodes[0]).toMatchObject({
			kind: "Interpolation",
			expression: { kind: "Path", path: ["a", "b"] },
			escape: true,
			source: "a.b",
			line: 1,
			column: 1,
		});
	});

	it("produces an Interpolation node for {{{ x }}} (escape=false)", () => {
		const ast = parse(lex("{{{ x }}}"));
		expect(ast.nodes[0]).toMatchObject({
			kind: "Interpolation",
			expression: { kind: "Path", path: ["x"] },
			escape: false,
		});
	});

	it("freezes the nodes array and individual nodes", () => {
		const ast = parse(lex("a{{ b }}c"));
		expect(Object.isFrozen(ast)).toBe(true);
		expect(Object.isFrozen(ast.nodes)).toBe(true);
		for (const node of ast.nodes) {
			expect(Object.isFrozen(node)).toBe(true);
		}
	});

	it("mixes text and interpolation in source order", () => {
		const ast = parse(lex("hi {{ name }}!"));
		expect(ast.nodes).toHaveLength(3);
		expect(ast.nodes[0]).toMatchObject({ kind: "Text", value: "hi " });
		expect(ast.nodes[1]).toMatchObject({
			kind: "Interpolation",
			expression: { kind: "Path", path: ["name"] },
		});
		expect(ast.nodes[2]).toMatchObject({ kind: "Text", value: "!" });
	});

	// --- 53.2 LayoutNode ---

	it("converts BLOCK_TAG `layout 'main'` to a LayoutNode", () => {
		const ast = parse(lex("{% layout 'main' %}"));
		expect(ast.nodes).toHaveLength(1);
		expect(ast.nodes[0]).toMatchObject({
			kind: "Layout",
			name: "main",
			raw: "layout 'main'",
			line: 1,
			column: 1,
		});
	});

	it('converts BLOCK_TAG `layout "main"` (double quote) to a LayoutNode', () => {
		const ast = parse(lex('{% layout "main" %}'));
		expect(ast.nodes[0]).toMatchObject({
			kind: "Layout",
			name: "main",
		});
	});

	it("strips a preceding whitespace-only TextNode before the LayoutNode (D12)", () => {
		const ast = parse(lex("\n  {% layout 'main' %}\nbody"));
		expect(ast.nodes).toHaveLength(2);
		expect(ast.nodes[0]).toMatchObject({ kind: "Layout", name: "main" });
		expect(ast.nodes[1]).toMatchObject({ kind: "Text", value: "\nbody" });
	});

	it("throws E_INKER_INVALID_LAYOUT_POSITION when LayoutNode follows non-whitespace text", () => {
		try {
			parse(lex("text\n{% layout 'main' %}"));
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_LAYOUT_POSITION");
		}
	});

	it("throws E_INKER_DUPLICATE_LAYOUT on two layout directives", () => {
		try {
			parse(lex("{% layout 'a' %}{% layout 'b' %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_DUPLICATE_LAYOUT");
			expect(err.message).toContain("first at line");
		}
	});

	// --- 53.2 PartialNode ---

	it("converts BLOCK_TAG `include 'partials/header'` to a PartialNode", () => {
		const ast = parse(lex("{% include 'partials/header' %}"));
		expect(ast.nodes[0]).toMatchObject({
			kind: "Partial",
			name: "partials/header",
			raw: "include 'partials/header'",
		});
	});

	// --- 53.2 SlotNode ---

	it("converts SLOT_PLACEHOLDER `body` to a SlotNode", () => {
		const ast = parse(lex("{{> body }}"));
		expect(ast.nodes[0]).toMatchObject({
			kind: "Slot",
			name: "body",
			line: 1,
			column: 1,
		});
	});

	// --- 53.3 directive grammar (if / each are now first-class) ---

	it("throws E_INKER_UNCLOSED_BLOCK for unclosed {% if x %}", () => {
		try {
			parse(lex("{% if x %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNCLOSED_BLOCK");
			expect(err.message).toContain("if");
		}
	});

	it("throws E_INKER_UNCLOSED_BLOCK for unclosed {% each items as item %}", () => {
		try {
			parse(lex("{% each items as item %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNCLOSED_BLOCK");
			expect(err.message).toContain("each");
		}
	});

	it("throws E_INKER_PARSE_ERROR on bare layout directive (no name)", () => {
		try {
			parse(lex("{% layout %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("requires a quoted template name");
		}
	});

	it("throws E_INKER_UNCLOSED_BLOCK_TAG on mismatched quotes `layout 'main\"`", () => {
		// Post-P3 (lex string-aware on %}): the unterminated single-quote
		// swallows the closing %} as string content, so the lexer reports the
		// structural failure (unclosed block tag) instead of the downstream
		// parse error. Either code is a clean fail-loud — UNCLOSED_BLOCK_TAG is
		// the more accurate root-cause.
		try {
			parse(lex(`{% layout 'main" %}`));
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_UNCLOSED_BLOCK_TAG",
			);
		}
	});

	it("throws E_INKER_PARSE_ERROR on trailing junk after layout name", () => {
		try {
			parse(lex("{% layout 'main' extra %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("Unexpected tokens");
		}
	});

	it("throws E_INKER_PARSE_ERROR for backslash separator in include name", () => {
		try {
			parse(lex(`{% include 'partials\\\\header' %}`));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("forward slashes");
		}
	});

	it("throws E_INKER_PARSE_ERROR for `..` segment in include name", () => {
		try {
			parse(lex("{% include '../etc' %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("'..'");
		}
	});

	it("throws E_INKER_PARSE_ERROR for absolute path in include name", () => {
		try {
			parse(lex("{% include '/abs/path' %}"));
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
			expect(err.message).toContain("absolute");
		}
	});

	it("throws E_INKER_PARSE_ERROR for empty include name", () => {
		try {
			parse(lex("{% include '' %}"));
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_PARSE_ERROR");
		}
	});

	it("freezes LayoutNode (mutating in strict mode throws)", () => {
		const ast = parse(lex("{% layout 'main' %}hello"));
		const node = ast.nodes[0];
		if (node === undefined) {
			expect.fail("no node");
			return;
		}
		expect(Object.isFrozen(node)).toBe(true);
	});

	// --- 53.3 block-balancing parser ---

	describe("if/endif blocks (53.3)", () => {
		it("produces an IfNode with thenNodes", () => {
			const ast = parse(lex("{% if user.admin %}ok{% endif %}"));
			expect(ast.nodes).toHaveLength(1);
			expect(ast.nodes[0]).toMatchObject({
				kind: "If",
				condition: {
					expression: { kind: "Path", path: ["user", "admin"] },
				},
				thenNodes: [{ kind: "Text", value: "ok" }],
				elseNodes: undefined,
			});
		});

		it("produces an IfNode with elseNodes when {% else %} present", () => {
			const ast = parse(lex("{% if x %}T{% else %}F{% endif %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "If",
				thenNodes: [{ kind: "Text", value: "T" }],
				elseNodes: [{ kind: "Text", value: "F" }],
			});
		});

		it("allows empty bodies — `{% if x %}{% endif %}`", () => {
			const ast = parse(lex("{% if x %}{% endif %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "If",
				thenNodes: [],
			});
		});

		it("throws E_INKER_UNCLOSED_BLOCK when EOF before {% endif %}", () => {
			expect(() => parse(lex("{% if x %}body"))).toThrowError(
				/E_INKER_UNCLOSED_BLOCK|never closed/,
			);
		});

		it("throws E_INKER_UNMATCHED_BLOCK_END for stray {% endif %}", () => {
			try {
				parse(lex("{% endif %}"));
				expect.fail("should have thrown");
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_UNMATCHED_BLOCK_END",
				);
			}
		});

		it("throws E_INKER_MISMATCHED_BLOCK_END when {% if %} closed by {% endeach %}", () => {
			try {
				parse(lex("{% if x %}body{% endeach %}"));
				expect.fail("should have thrown");
			} catch (e) {
				const err = asTyped<InkerRenderError>(e);
				expect(err.code).toBe("E_INKER_MISMATCHED_BLOCK_END");
			}
		});

		it("throws E_INKER_INVALID_EXPRESSION for multiple else", () => {
			try {
				parse(lex("{% if x %}a{% else %}b{% else %}c{% endif %}"));
				expect.fail("should have thrown");
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_INVALID_EXPRESSION",
				);
			}
		});

		it("throws E_INKER_UNMATCHED_BLOCK_END for freestanding {% else %}", () => {
			try {
				parse(lex("hello {% else %} world"));
				expect.fail("should have thrown");
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_UNMATCHED_BLOCK_END",
				);
			}
		});
	});

	describe("each/endeach blocks (53.3)", () => {
		it("produces an EachNode", () => {
			const ast = parse(lex("{% each items as item %}row{% endeach %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "Each",
				iterable: { kind: "Path", path: ["items"] },
				binding: { kind: "Single", name: "item" },
				bodyNodes: [{ kind: "Text", value: "row" }],
				elseNodes: undefined,
			});
		});

		it("supports `{% else %}` empty-array fallback", () => {
			const ast = parse(
				lex("{% each items as item %}row{% else %}empty{% endeach %}"),
			);
			expect(ast.nodes[0]).toMatchObject({
				kind: "Each",
				bodyNodes: [{ kind: "Text", value: "row" }],
				elseNodes: [{ kind: "Text", value: "empty" }],
			});
		});

		it("allows empty body — `{% each items as item %}{% endeach %}`", () => {
			const ast = parse(lex("{% each items as item %}{% endeach %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "Each",
				bodyNodes: [],
			});
		});

		it("throws E_INKER_UNCLOSED_BLOCK when EOF before {% endeach %}", () => {
			try {
				parse(lex("{% each items as item %}row"));
				expect.fail("should have thrown");
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_UNCLOSED_BLOCK",
				);
			}
		});
	});

	describe("nested blocks (53.3)", () => {
		it("nests if inside each", () => {
			const ast = parse(
				lex(
					"{% each items as item %}{% if item.visible %}V{% endif %}{% endeach %}",
				),
			);
			const each = ast.nodes[0];
			if (each === undefined || each.kind !== "Each") {
				expect.fail("expected EachNode");
				return;
			}
			expect(each.bodyNodes[0]).toMatchObject({ kind: "If" });
		});

		it("nests each inside if", () => {
			const ast = parse(
				lex(
					"{% if showList %}{% each items as item %}row{% endeach %}{% endif %}",
				),
			);
			const ifNode = ast.nodes[0];
			if (ifNode === undefined || ifNode.kind !== "If") {
				expect.fail("expected IfNode");
				return;
			}
			expect(ifNode.thenNodes[0]).toMatchObject({ kind: "Each" });
		});

		it("nests component inside each", () => {
			const ast = parse(
				lex(
					"{% each users as user %}{% component 'card' { name: user.name } %}{% endeach %}",
				),
			);
			const each = ast.nodes[0];
			if (each === undefined || each.kind !== "Each") {
				expect.fail("expected EachNode");
				return;
			}
			expect(each.bodyNodes[0]).toMatchObject({
				kind: "Component",
				name: "card",
			});
		});

		it("deeply nests if-in-each-in-if", () => {
			const ast = parse(
				lex(
					"{% if outer %}{% each items as item %}{% if item.visible %}X{% endif %}{% endeach %}{% endif %}",
				),
			);
			const outerIf = ast.nodes[0];
			if (outerIf === undefined || outerIf.kind !== "If") {
				expect.fail();
				return;
			}
			const each = outerIf.thenNodes[0];
			if (each === undefined || each.kind !== "Each") {
				expect.fail();
				return;
			}
			expect(each.bodyNodes[0]).toMatchObject({ kind: "If" });
		});

		it("preserves Text nodes inside If and Each branches", () => {
			const ast = parse(lex("{% if x %}A{{ y }}B{% endif %}"));
			const ifn = ast.nodes[0];
			if (ifn === undefined || ifn.kind !== "If") {
				expect.fail();
				return;
			}
			expect(ifn.thenNodes.map((n) => n.kind)).toEqual([
				"Text",
				"Interpolation",
				"Text",
			]);
		});
	});

	describe("component nodes (53.3)", () => {
		it("emits a ComponentNode at root", () => {
			const ast = parse(lex("{% component 'card' { title: page.title } %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "Component",
				name: "card",
				args: [
					{
						key: "title",
						value: { kind: "Path", path: ["page", "title"] },
					},
				],
			});
		});

		it("emits a self-closing ComponentNode (no body)", () => {
			const ast = parse(lex("{% component 'card' {} %}"));
			expect(ast.nodes[0]).toMatchObject({
				kind: "Component",
				name: "card",
				args: [],
			});
		});
	});

	it("freezes IfNode, EachNode, and ComponentNode", () => {
		const ast = parse(
			lex(
				"{% if a %}{% each items as i %}{% endeach %}{% endif %}{% component 'card' {} %}",
			),
		);
		for (const n of ast.nodes) {
			expect(Object.isFrozen(n)).toBe(true);
		}
	});
});
