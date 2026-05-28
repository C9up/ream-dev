import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse } from "../../src/parse.js";
import { type HelperFn, renderAst } from "../../src/render.js";
import { SafeString } from "../../src/SafeString.js";
import { asTyped, bypassTypeCheck } from "../__helpers__/bypass-type-check.js";

function render(
	src: string,
	data: Readonly<Record<string, unknown>>,
	helpers?: ReadonlyMap<string, HelperFn>,
): string {
	const ast = parse(lex(src), { helpers: new Set(helpers?.keys() ?? []) });
	return renderAst(ast, data, { helpers });
}

function expectThrow(
	fn: () => unknown,
	code: string,
	msg?: string | RegExp,
): void {
	try {
		fn();
		expect.fail("expected throw");
	} catch (e) {
		expect(e).toBeInstanceOf(InkerRenderError);
		const err = asTyped<InkerRenderError>(e);
		expect(err.code).toBe(code);
		if (typeof msg === "string") expect(err.message).toContain(msg);
		else if (msg instanceof RegExp) expect(err.message).toMatch(msg);
	}
}

// R1 — backtick HTML-escape (XSS in unquoted attributes)
describe("chunk2 R1 — backtick is HTML-escaped", () => {
	it("escapes backtick to &#96; in interpolation", () => {
		expect(render("{{ x }}", { x: "a`b" })).toBe("a&#96;b");
	});

	it("escapes the full OWASP set in one go", () => {
		expect(render("{{ x }}", { x: `<&>"'` + "`" })).toBe(
			"&lt;&amp;&gt;&quot;&#39;&#96;",
		);
	});

	it("raw interpolation `{{{ x }}}` still bypasses escaping for backticks", () => {
		expect(render("{{{ x }}}", { x: "a`b" })).toBe("a`b");
	});
});

// R2 — relational comparator rejects mixed bigint/number
describe("chunk2 R2 — compareBinary rejects mixed bigint/number relational", () => {
	it("throws E_INKER_INVALID_EXPRESSION for `bigint < number`", () => {
		expectThrow(
			() => render("{{ a < b }}", { a: 1n, b: 2 }),
			"E_INKER_INVALID_EXPRESSION",
			"relational operators",
		);
	});

	it("throws E_INKER_INVALID_EXPRESSION for `number > bigint`", () => {
		expectThrow(
			() => render("{{ a > b }}", { a: 2, b: 1n }),
			"E_INKER_INVALID_EXPRESSION",
		);
	});

	it("still accepts homogeneous `bigint < bigint`", () => {
		expect(render("{{ a < b }}", { a: 1n, b: 2n })).toBe("true");
	});

	it("still accepts homogeneous `number < number`", () => {
		expect(render("{{ a < b }}", { a: 1, b: 2 })).toBe("true");
	});

	it("still accepts homogeneous `string < string` (codepoint order)", () => {
		expect(render("{{ a < b }}", { a: "alpha", b: "beta" })).toBe("true");
	});
});

// R3 — Reflect.get(result, "then") is inside the helper try/catch
describe("chunk2 R3 — poisoned-getter helper wraps as E_INKER_HELPER_THROW", () => {
	it("wraps a throwing `then` getter as E_INKER_HELPER_THROW (not raw TypeError)", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"poisoned",
				() => {
					const result: { value: string } = { value: "x" };
					// biome-ignore lint/suspicious/noThenProperty: load-bearing — R3 explicitly tests the poisoned-getter wrap behavior
					Object.defineProperty(result, "then", {
						get() {
							throw new Error("poisoned getter");
						},
					});
					return bypassTypeCheck<string>(result);
				},
			],
		]);
		expectThrow(
			() => render("{{ poisoned() }}", {}, helpers),
			"E_INKER_HELPER_THROW",
			/poisoned getter/,
		);
	});
});

// R4 — destructured pair sparse-hole rejected
describe("chunk2 R4 — destructured each rejects sparse pairs", () => {
	it("throws when pair has a sparse hole at index 0", () => {
		const items = bypassTypeCheck<Array<Array<string>>>([
			// biome-ignore lint/suspicious/noSparseArray: load-bearing — R4 explicitly tests sparse-pair rejection
			[, "v"],
		]);
		expectThrow(
			() =>
				render("{% each items as [k, v] %}{{k}}={{v}}{% endeach %}", { items }),
			"E_INKER_INVALID_ITERABLE",
			"sparse-array hole",
		);
	});

	it("throws when pair has a sparse hole at index 1", () => {
		// Build the pair with `delete` so we get a true sparse hole at index 1
		// without tripping the `noSparseArray` lint on a [k,] literal.
		const pair = ["k", "v"];
		delete pair[1];
		const items = bypassTypeCheck<Array<Array<string>>>([pair]);
		expectThrow(
			() =>
				render("{% each items as [k, v] %}{{k}}={{v}}{% endeach %}", { items }),
			"E_INKER_INVALID_ITERABLE",
		);
	});

	it("still accepts explicit `undefined` in a pair element", () => {
		const items = [["k", undefined]];
		expect(
			render("{% each items as [k, v] %}{{k}}{% endeach %}", { items }),
		).toBe("k");
	});

	it("renders dense pairs normally", () => {
		expect(
			render("{% each pairs as [k, v] %}{{k}}={{v}};{% endeach %}", {
				pairs: [
					["a", 1],
					["b", 2],
				],
			}),
		).toBe("a=1;b=2;");
	});
});

// R5 — bodyHtml runtime type check
describe("chunk2 R5 — bodyHtml runtime type check", () => {
	it("rejects non-string bodyHtml at the Slot arm", () => {
		const ast = parse(lex("{{> body }}"));
		try {
			renderAst(ast, {}, { bodyHtml: bypassTypeCheck<string>(42) });
			expect.fail("expected throw");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toMatch(/Layout body must be a string/);
		}
	});

	it("accepts undefined bodyHtml (slot renders empty)", () => {
		const ast = parse(lex("before:{{> body }}:after"));
		expect(renderAst(ast, {})).toBe("before::after");
	});

	it("accepts string bodyHtml normally", () => {
		const ast = parse(lex("before:{{> body }}:after"));
		expect(renderAst(ast, {}, { bodyHtml: "BODY" })).toBe("before:BODY:after");
	});
});

// R6 — null-prototype preserved across Each iteration
describe("chunk2 R6 — Each scope preserves null-prototype invariant", () => {
	it("inner each body sees null-prototype scope (single binding)", () => {
		const helpers = new Map<string, HelperFn>([["hasToString", () => "n/a"]]);
		// `{{ toString }}` would resolve to Object.prototype.toString if the
		// scope had Object.prototype. resolvePath's Object.hasOwn guard already
		// rejects this, but the R6 patch also strips the prototype at the scope
		// construction site — verify resolvePath sees a clean own-property miss.
		expectThrow(
			() =>
				render(
					"{% each xs as x %}{{ toString }}{% endeach %}",
					{ xs: [1] },
					helpers,
				),
			"E_INKER_UNKNOWN_IDENTIFIER",
		);
	});

	it("inner each body sees null-prototype scope (destructured binding)", () => {
		expectThrow(
			() =>
				render("{% each pairs as [k, v] %}{{ toString }}{% endeach %}", {
					pairs: [["a", 1]],
				}),
			"E_INKER_UNKNOWN_IDENTIFIER",
		);
	});

	it("parent data is still readable inside the loop", () => {
		expect(
			render("{% each xs as x %}{{ greeting }}-{{ x }};{% endeach %}", {
				greeting: "hi",
				xs: ["a", "b"],
			}),
		).toBe("hi-a;hi-b;");
	});

	it("binding shadows parent key correctly", () => {
		expect(
			render("{% each xs as greeting %}{{ greeting }};{% endeach %}", {
				greeting: "outer",
				xs: ["a", "b"],
			}),
		).toBe("a;b;");
	});
});

// R7 — SafeString throws InkerRenderError (already covered in SafeString.test.ts,
// add cross-cutting test that helpers also surface it cleanly)
describe("chunk2 R7 — SafeString constructor uses typed-error contract", () => {
	it("a helper that constructs SafeString from non-string surfaces InkerRenderError", () => {
		const helpers = new Map<string, HelperFn>([
			["badSafe", () => new SafeString(bypassTypeCheck<string>(42))],
		]);
		// The helper try/catch wraps the InkerRenderError into HELPER_THROW —
		// but per the existing render.ts:223 guard, InkerRenderError is
		// re-thrown directly with its typed code preserved.
		expectThrow(
			() => render("{{ badSafe() }}", {}, helpers),
			"E_INKER_INVALID_EXPRESSION",
			/SafeString requires a string/,
		);
	});
});

// R8 — normalizePartialKey canonicalises equivalent paths.
// Note: most degenerate forms (`./foo`, `foo//bar`, `foo/./bar`, `foo/`)
// are rejected at PARSE TIME by validatePathName (chunk1 P8/P9), so they
// never reach normalizePartialKey from a real template. R8 hardens the
// function as defense-in-depth for direct renderAst callers who hand-build
// partialAsts maps with already-normalized keys.
describe("chunk2 R8 — normalizePartialKey hardening (defense-in-depth)", () => {
	const partialBody = parse(lex("PARTIAL"));
	const partialsMap = new Map([["foo/bar", partialBody]]);

	it("resolves a well-formed `foo/bar` against the partial map", () => {
		const ast = parse(lex("{% include 'foo/bar' %}"));
		expect(renderAst(ast, {}, { partialAsts: partialsMap })).toBe("PARTIAL");
	});

	it("a direct caller supplying `./foo/bar` (no parser involved) still resolves", () => {
		// Simulate a renderer-direct caller (e.g. a downstream codegen tool)
		// that hand-builds an AST containing a Partial node with a `./`-prefixed
		// name — the normalizer must strip it to find the canonical map entry.
		// Build the AST programmatically so we bypass parseBlockTag's path
		// validation.
		const includeAst = bypassTypeCheck<Parameters<typeof renderAst>[0]>({
			nodes: [
				bypassTypeCheck<Parameters<typeof renderAst>[0]["nodes"][number]>({
					kind: "Partial",
					name: "./foo/bar",
					raw: "include './foo/bar'",
					line: 1,
					column: 1,
				}),
			],
		});
		expect(renderAst(includeAst, {}, { partialAsts: partialsMap })).toBe(
			"PARTIAL",
		);
	});

	it("collapses repeated slashes in a direct caller's Partial node", () => {
		const includeAst = bypassTypeCheck<Parameters<typeof renderAst>[0]>({
			nodes: [
				bypassTypeCheck<Parameters<typeof renderAst>[0]["nodes"][number]>({
					kind: "Partial",
					name: "foo//bar",
					raw: "include 'foo//bar'",
					line: 1,
					column: 1,
				}),
			],
		});
		expect(renderAst(includeAst, {}, { partialAsts: partialsMap })).toBe(
			"PARTIAL",
		);
	});
});

// R9 — implicit in R2: explicit case-per-op means missing op throws via never
//      (the relationalCompare exhaustiveness arm). No direct test possible
//      without TypeScript-level guarantees, but covered by the type-system.

// R10 — exhaustiveness throws InkerRenderError (typed)
describe("chunk2 R10 — unreachable InkerNode kind throws InkerRenderError", () => {
	it("synthetic unknown node kind surfaces a typed E_INKER_INVALID_EXPRESSION", () => {
		// Hand-craft an AST with a node whose kind is outside the InkerNode
		// union to hit the exhaustiveness arm.
		const fakeAst = bypassTypeCheck<Parameters<typeof renderAst>[0]>({
			nodes: [
				bypassTypeCheck<Parameters<typeof renderAst>[0]["nodes"][number]>({
					kind: "UnknownKind",
				}),
			],
		});
		expectThrow(
			() => renderAst(fakeAst, {}),
			"E_INKER_INVALID_EXPRESSION",
			"unknown node kind",
		);
	});
});
