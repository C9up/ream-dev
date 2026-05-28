import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { parsePath } from "../../src/parsePath.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

describe("parsePath — accepted forms", () => {
	it("single identifier", () => {
		expect(parsePath("a", 1, 1)).toEqual(["a"]);
	});

	it("dot chain", () => {
		expect(parsePath("a.b.c", 1, 1)).toEqual(["a", "b", "c"]);
	});

	it("bracket integer", () => {
		const path = parsePath("a[0]", 1, 1);
		expect(path).toEqual(["a", 0]);
		expect(typeof path[1]).toBe("number");
	});

	it("bracket double-quoted string", () => {
		expect(parsePath('a["b c"]', 1, 1)).toEqual(["a", "b c"]);
	});

	it("bracket single-quoted string", () => {
		expect(parsePath("a['b c']", 1, 1)).toEqual(["a", "b c"]);
	});

	it("mixed dot and bracket access", () => {
		const path = parsePath('a[0].b["c d"]', 1, 1);
		expect(path).toEqual(["a", 0, "b", "c d"]);
		expect(typeof path[1]).toBe("number");
		expect(typeof path[3]).toBe("string");
	});

	it("bracket-string supports escaped quote", () => {
		expect(parsePath('a["b\\"c"]', 1, 1)).toEqual(["a", 'b"c']);
	});

	it("bracket-string supports escaped backslash", () => {
		expect(parsePath('a["b\\\\c"]', 1, 1)).toEqual(["a", "b\\c"]);
	});
});

describe("parsePath — rejected forms", () => {
	const rejected: ReadonlyArray<[string, RegExp]> = [
		["a + b", /unexpected character|JS expressions/],
		["fn(x)", /unexpected character|JS expressions/],
		["a?.b", /optional chaining|unexpected character/],
		["a == b", /unexpected character|JS expressions/],
		["a ? b : c", /unexpected character|JS expressions/],
		["!a", /expected identifier|unexpected character/],
		["a..b", /adjacent dots/],
		[".a", /expected identifier/],
		["a.", /trailing dot/],
		["", /empty path/],
		["a[-1]", /negative integer/],
		["a[1.5]", /float index/],
	];

	for (const [input, pattern] of rejected) {
		it(`rejects ${JSON.stringify(input)}`, () => {
			try {
				parsePath(input, 1, 1);
				expect.fail(`expected '${input}' to throw`);
			} catch (e) {
				expect(e).toBeInstanceOf(InkerRenderError);
				const err = asTyped<InkerRenderError>(e);
				expect(err.code).toBe("E_INKER_PARSE_ERROR");
				expect(err.message).toMatch(pattern);
			}
		});
	}

	it("rejects non-supported escape in bracket-string", () => {
		try {
			parsePath('a["b\\nc"]', 1, 1);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe("E_INKER_PARSE_ERROR");
			expect(asTyped<InkerRenderError>(e).message).toMatch(
				/unsupported escape/,
			);
		}
	});
});
