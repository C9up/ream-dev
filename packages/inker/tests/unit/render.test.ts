import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse, type TemplateAst } from "../../src/parse.js";
import { renderAst } from "../../src/render.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

function render(
	source: string,
	data: Readonly<Record<string, unknown>>,
): string {
	return renderAst(parse(lex(source)), data);
}

describe("renderAst", () => {
	it("passes plain text through verbatim", () => {
		expect(render("hello world", {})).toBe("hello world");
	});

	it("renders {{ name }} from data", () => {
		expect(render("{{ name }}", { name: "world" })).toBe("world");
	});

	it("HTML-escapes interpolated values by default", () => {
		expect(render("{{ name }}", { name: "<script>" })).toBe("&lt;script&gt;");
	});

	it("escapes ampersand, quotes, and apostrophe", () => {
		expect(render("{{ x }}", { x: `&"'<>` })).toBe("&amp;&quot;&#39;&lt;&gt;");
	});

	it("triple-brace renders raw, unescaped HTML", () => {
		expect(render("{{{ name }}}", { name: "<b>x</b>" })).toBe("<b>x</b>");
	});

	it("null leaf renders as empty string (escaped form)", () => {
		expect(render("{{ x }}", { x: null })).toBe("");
	});

	it("null leaf renders as empty string (raw form)", () => {
		expect(render("{{{ x }}}", { x: null })).toBe("");
	});

	it("undefined leaf renders as empty string in both modes", () => {
		expect(render("{{ x }}", { x: undefined })).toBe("");
		expect(render("{{{ x }}}", { x: undefined })).toBe("");
	});

	it("number leaf stringifies via String()", () => {
		expect(render("{{ x }}", { x: 42 })).toBe("42");
	});

	it("boolean leaf stringifies to 'true' / 'false'", () => {
		expect(render("{{ x }}", { x: true })).toBe("true");
		expect(render("{{ x }}", { x: false })).toBe("false");
	});

	it("Date leaf rejected under 53.4-P23 strict policy (register a helper instead)", () => {
		// Pre-53.4 used String(Date) coercion; 53.4-P23 rejects any object
		// (including Date) to surface the silent "[object Object]" footgun
		// for plain objects and keep the policy uniform. Date rendering now
		// requires `{{ formatDate(d) }}` via a caller-registered helper.
		try {
			render("{{ x }}", { x: new Date(0) });
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toContain("Date");
		}
	});

	it("multiple interpolations are concatenated in order", () => {
		expect(render("{{a}} + {{b}} = {{c}}", { a: 1, b: 2, c: 3 })).toBe(
			"1 + 2 = 3",
		);
	});

	// --- 53.2 slot / partial / layout branches ---

	it("Slot with bodyHtml in context renders verbatim (no escape)", () => {
		const layoutAst = parse(lex("<html><body>{{> body }}</body></html>"));
		const out = renderAst(layoutAst, {}, { bodyHtml: "<p>Hi</p>" });
		expect(out).toBe("<html><body><p>Hi</p></body></html>");
	});

	it("Slot with undefined bodyHtml renders empty string (D10)", () => {
		const ast = parse(lex("<html>{{> body }}</html>"));
		expect(renderAst(ast, {})).toBe("<html></html>");
	});

	it("Slot with unknown name throws E_INKER_UNKNOWN_SLOT (defensive)", () => {
		const ast = parse(lex("<html>{{> head }}</html>"));
		try {
			renderAst(ast, {}, { bodyHtml: "anything" });
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_UNKNOWN_SLOT");
		}
	});

	it("Partial node renders the partial AST inline using partialAsts map", () => {
		const partialAst = parse(lex("<footer>{{ year }}</footer>"));
		const partials = new Map<string, TemplateAst>([
			["partials/footer", partialAst],
		]);
		const ast = parse(lex("<p>x</p>{% include 'partials/footer' %}"));
		const out = renderAst(ast, { year: 2026 }, { partialAsts: partials });
		expect(out).toBe("<p>x</p><footer>2026</footer>");
	});

	it("Partial node with no match in partialAsts throws E_INKER_DISK_REQUIRED", () => {
		const ast = parse(lex("{% include 'missing' %}"));
		try {
			renderAst(ast, {}, { partialAsts: new Map() });
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_DISK_REQUIRED");
			expect(asTyped<InkerRenderError>(e).message).toContain(
				"{% include 'missing' %}",
			);
		}
	});

	it("Layout node reaching renderAst throws E_INKER_DISK_REQUIRED", () => {
		const ast = parse(lex("{% layout 'main' %}hello"));
		try {
			renderAst(ast, {});
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_DISK_REQUIRED");
			expect(asTyped<InkerRenderError>(e).message).toContain(
				"{% layout 'main' %}",
			);
		}
	});

	it("Partial-in-partial recurses with full data scope (D4)", () => {
		const inner = parse(lex("[{{ name }}]"));
		const outer = parse(lex("(wrap{% include 'partials/inner' %})"));
		const partials = new Map<string, TemplateAst>([
			["partials/inner", inner],
			["partials/outer", outer],
		]);
		const entry = parse(lex("X{% include 'partials/outer' %}Y"));
		const out = renderAst(entry, { name: "Alice" }, { partialAsts: partials });
		expect(out).toBe("X(wrap[Alice])Y");
	});

	// --- 53.3 If / Each / Component ---

	describe("If branch (53.3)", () => {
		it("renders thenNodes when truthy", () => {
			expect(render("{% if v %}YES{% endif %}", { v: true })).toBe("YES");
			expect(render("{% if v %}YES{% endif %}", { v: 1 })).toBe("YES");
			expect(render("{% if v %}YES{% endif %}", { v: "x" })).toBe("YES");
		});

		it("renders elseNodes when falsy", () => {
			expect(render("{% if v %}T{% else %}F{% endif %}", { v: false })).toBe(
				"F",
			);
			expect(render("{% if v %}T{% else %}F{% endif %}", { v: 0 })).toBe("F");
			expect(render("{% if v %}T{% else %}F{% endif %}", { v: "" })).toBe("F");
		});

		it("renders nothing when falsy and no else", () => {
			expect(render("{% if v %}T{% endif %}", { v: false })).toBe("");
		});

		it("negate '!' inverts truthiness", () => {
			expect(render("{% if !v %}T{% endif %}", { v: false })).toBe("T");
			expect(render("{% if !v %}T{% endif %}", { v: true })).toBe("");
		});

		it("propagates resolvePath errors for missing identifier", () => {
			expect(() => render("{% if v %}T{% endif %}", {})).toThrowError(
				/E_INKER_UNKNOWN_IDENTIFIER|own property/,
			);
		});
	});

	describe("Each loop (53.3)", () => {
		it("iterates an array and shadows parent with the binding", () => {
			expect(
				render("{% each items as item %}<{{ item }}>{% endeach %}", {
					items: ["a", "b", "c"],
				}),
			).toBe("<a><b><c>");
		});

		it("preserves parent data inside loop body", () => {
			expect(
				render(
					"{% each items as item %}[{{ prefix }}{{ item }}]{% endeach %}",
					{ items: ["x", "y"], prefix: "P-" },
				),
			).toBe("[P-x][P-y]");
		});

		it("renders the else branch on empty array", () => {
			expect(
				render("{% each items as item %}row{% else %}empty{% endeach %}", {
					items: [],
				}),
			).toBe("empty");
		});

		it("renders nothing when empty and no else", () => {
			expect(
				render("{% each items as item %}row{% endeach %}", {
					items: [],
				}),
			).toBe("");
		});

		it("throws E_INKER_INVALID_ITERABLE on null", () => {
			try {
				render("{% each items as item %}row{% endeach %}", {
					items: null,
				});
				expect.fail();
			} catch (e) {
				const err = asTyped<InkerRenderError>(e);
				expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
				expect(err.message).toContain("did you forget");
			}
		});

		it("throws E_INKER_INVALID_ITERABLE on undefined", () => {
			try {
				render("{% each items as item %}row{% endeach %}", {
					items: undefined,
				});
				expect.fail();
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_INVALID_ITERABLE",
				);
			}
		});

		it("throws E_INKER_INVALID_ITERABLE on Map (defer to 53.4)", () => {
			try {
				render("{% each items as item %}row{% endeach %}", {
					items: new Map([["a", 1]]),
				});
				expect.fail();
			} catch (e) {
				const err = asTyped<InkerRenderError>(e);
				expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
				expect(err.message).toContain("object");
			}
		});

		it("does NOT share `binding` reference across iterations (shallow per-iter merge)", () => {
			const tpl = "{% each items as v %}<{{ v }}>{% endeach %}";
			const result = render(tpl, { items: [1, 2, 3] });
			expect(result).toBe("<1><2><3>");
		});
	});

	describe("Component (53.3)", () => {
		it("renders a Component with scoped args", () => {
			const componentAst = parse(lex("[{{ title }}]"));
			const entry = parse(
				lex("X{% component 'card' { title: page.title } %}Y"),
			);
			const out = renderAst(
				entry,
				{ page: { title: "Hello" } },
				{
					componentAsts: new Map<string, TemplateAst>([["card", componentAst]]),
				},
			);
			expect(out).toBe("X[Hello]Y");
		});

		it("hides parent data — only args are visible (D7)", () => {
			// `user` should NOT be visible inside the component.
			const componentAst = parse(lex("[{{ title }}]"));
			const entry = parse(lex("{% component 'card' { title: page.title } %}"));
			expect(() =>
				renderAst(
					entry,
					{ page: { title: "Hi" }, user: { name: "Alice" } },
					{
						componentAsts: new Map<string, TemplateAst>([
							["card", componentAst],
						]),
					},
				),
			).not.toThrow();
			// Now build a component that references `user` — should throw.
			const leakComp = parse(lex("[{{ user.name }}]"));
			const entry2 = parse(lex("{% component 'card' {} %}"));
			expect(() =>
				renderAst(
					entry2,
					{ user: { name: "Alice" } },
					{
						componentAsts: new Map<string, TemplateAst>([["card", leakComp]]),
					},
				),
			).toThrowError(/E_INKER_UNKNOWN_IDENTIFIER|user/);
		});

		it("clears bodyHtml inside the component (no slot leak from outer layout)", () => {
			// Even when the outer renderAst call has bodyHtml set (mimicking
			// layout-injection), the component must render with bodyHtml=undefined.
			// A `{{> body }}` slot inside a component renders empty (the composer's
			// slot-leak guard is the strict gate, but render-time stays lenient).
			const componentAst = parse(lex("[{{> body }}]"));
			const entry = parse(lex("{% component 'card' {} %}"));
			const out = renderAst(
				entry,
				{},
				{
					bodyHtml: "OUTER_BODY",
					componentAsts: new Map<string, TemplateAst>([["card", componentAst]]),
				},
			);
			expect(out).toBe("[]");
		});

		it("throws E_INKER_DISK_REQUIRED when componentAsts missing the name", () => {
			const entry = parse(lex("{% component 'card' {} %}"));
			try {
				renderAst(entry, {}, {});
				expect.fail();
			} catch (e) {
				expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_DISK_REQUIRED");
			}
		});

		it("component-in-each renders N times with per-iter args", () => {
			const card = parse(lex("[{{ name }}]"));
			const entry = parse(
				lex(
					"{% each users as user %}{% component 'card' { name: user.name } %}{% endeach %}",
				),
			);
			const out = renderAst(
				entry,
				{ users: [{ name: "A" }, { name: "B" }] },
				{
					componentAsts: new Map<string, TemplateAst>([["card", card]]),
				},
			);
			expect(out).toBe("[A][B]");
		});

		it("if-inside-each-inside-if renders the truthy path only", () => {
			const tpl =
				"{% if outer %}{% each items as item %}{% if item.show %}!{{ item.name }}!{% endif %}{% endeach %}{% endif %}";
			const out = render(tpl, {
				outer: true,
				items: [
					{ show: true, name: "A" },
					{ show: false, name: "B" },
					{ show: true, name: "C" },
				],
			});
			expect(out).toBe("!A!!C!");
		});
	});
});
