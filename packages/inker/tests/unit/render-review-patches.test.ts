import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse } from "../../src/parse.js";
import { parsePath } from "../../src/parsePath.js";
import { renderAst } from "../../src/render.js";
import { resolvePath } from "../../src/resolvePath.js";
import { asTyped, bypassTypeCheck } from "../__helpers__/bypass-type-check.js";

function render(
	source: string,
	data: Readonly<Record<string, unknown>>,
): string {
	return renderAst(parse(lex(source)), data);
}

describe("renderAst — safeStringify rejects non-string objects strictly (53.4-P23)", () => {
	it("throws E_INKER_INVALID_EXPRESSION when interpolating a plain object (toString never invoked)", () => {
		// 53.4-P23 supersedes 53.2-P8: safeStringify never calls toString on
		// objects — non-string non-coercible values are rejected upfront with a
		// hint to use a specific field path or register a helper. The throwing
		// toString below is therefore unreachable; the test asserts the new
		// strict policy.
		const data = {
			x: {
				toString() {
					throw new Error(
						"toString must not be called under the strict policy",
					);
				},
			},
		};
		try {
			render("{{ x }}", data);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toMatch(/specific field path/);
		}
	});

	it("applies the same strict policy in raw-mode (triple-brace)", () => {
		const data = { x: { toString: () => "should not be called" } };
		try {
			render("{{{ x }}}", data);
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_INVALID_EXPRESSION",
			);
		}
	});
});

describe("resolvePath — sparse-array strict-by-default (P2)", () => {
	it("throws E_INKER_UNKNOWN_IDENTIFIER for a sparse array hole", () => {
		// biome-ignore lint/suspicious/noSparseArray: the sparse hole IS the test — resolvePath must reject it
		const data = { items: bypassTypeCheck<unknown[]>([1, , 3]) };
		try {
			resolvePath(data, ["items", 1]);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNKNOWN_IDENTIFIER");
			expect(err.message).toMatch(/sparse hole/);
		}
	});

	it("still returns the value for a normal in-bounds array slot", () => {
		expect(resolvePath({ items: [10, 20, 30] }, ["items", 1])).toBe(20);
	});
});

describe("parsePath — frozen segments (P11)", () => {
	it("returns a frozen segments array (deep-immutability against cache poisoning)", () => {
		const segments = parsePath("a.b.c", 1, 1);
		expect(Object.isFrozen(segments)).toBe(true);
	});
});

describe("renderAst — each rejects sparse-array holes (53.3-P4)", () => {
	it("throws E_INKER_INVALID_ITERABLE on a sparse-array hole", () => {
		const items: Array<number | undefined> = [1, 2, 3];
		delete items[1];
		try {
			render("{% each items as item %}{{ item }}{% endeach %}", { items });
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_INVALID_ITERABLE",
			);
			expect(asTyped<InkerRenderError>(e).message).toMatch(
				/sparse-array hole at index 1/,
			);
		}
	});

	it("renders a dense array of length 3 without throwing", () => {
		expect(
			render("{% each xs as x %}{{ x }}{% endeach %}", {
				xs: ["a", "b", "c"],
			}),
		).toBe("abc");
	});

	it("does not interpret an explicit `undefined` element as a hole", () => {
		// Explicit undefined IS an own-property; only true holes (delete / Array
		// constructor) should fail.
		expect(
			render("{% each xs as x %}-{% endeach %}", {
				xs: [1, undefined, 3],
			}),
		).toBe("---");
	});
});

describe("parsePath — error message includes intra-expression offset (P4)", () => {
	it("error message points at the offending character offset inside the expression", () => {
		try {
			parsePath("a + b", 1, 1);
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_PARSE_ERROR");
			// Offset 1 (0-indexed) of "a + b" is the space — first non-ident char
			// after consuming `a` — surfaced as "character 2".
			expect(asTyped<InkerRenderError>(e).message).toMatch(
				/at character 2 of the expression/,
			);
		}
	});
});
