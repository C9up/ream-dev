import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { resolvePath } from "../../src/resolvePath.js";
import { asTyped, bypassTypeCheck } from "../__helpers__/bypass-type-check.js";

describe("resolvePath — happy paths", () => {
	it("walks a nested object", () => {
		expect(resolvePath({ a: { b: { c: 1 } } }, ["a", "b", "c"])).toBe(1);
	});

	it("indexes into an array via numeric segment", () => {
		expect(resolvePath({ a: [10, 20, 30] }, ["a", 1])).toBe(20);
	});

	it("indexes into an object with bracket-string key", () => {
		expect(resolvePath({ a: { "b c": 5 } }, ["a", "b c"])).toBe(5);
	});
});

describe("resolvePath — misses throw E_INKER_UNKNOWN_IDENTIFIER", () => {
	it("missing root identifier mentions the identifier", () => {
		try {
			resolvePath({}, ["x"]);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNKNOWN_IDENTIFIER");
			expect(err.message).toMatch(/'x'/);
		}
	});

	it("missing mid-path includes the consumed prefix", () => {
		try {
			resolvePath({ a: {} }, ["a", "b"]);
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_UNKNOWN_IDENTIFIER",
			);
			expect(asTyped<InkerRenderError>(e).message).toMatch(/\["a"\]/);
		}
	});

	it("null at intermediate throws", () => {
		expect(() => resolvePath({ a: null }, ["a", "b"])).toThrow(
			InkerRenderError,
		);
	});

	it("string segment against an array throws", () => {
		expect(() => resolvePath({ a: [1, 2] }, ["a", "b"])).toThrow(
			InkerRenderError,
		);
	});

	it("numeric segment against a plain object throws", () => {
		expect(() => resolvePath({ a: {} }, ["a", 0])).toThrow(InkerRenderError);
	});
});

describe("resolvePath — leaf edge cases", () => {
	it("returns null when the leaf value is null (own property)", () => {
		expect(resolvePath({ a: null }, ["a"])).toBeNull();
	});

	it("returns undefined when the leaf value is undefined (own property)", () => {
		expect(resolvePath({ a: undefined }, ["a"])).toBeUndefined();
	});

	it("rejects inherited properties (prototype-pollution guard)", () => {
		const proto = { x: 1 };
		const child = bypassTypeCheck<Record<string, unknown>>(
			Object.create(proto),
		);
		// child has NO own property 'x', so the prototype's x must NOT resolve.
		try {
			resolvePath({ a: child }, ["a", "x"]);
			expect.fail("should have thrown");
		} catch (e) {
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_UNKNOWN_IDENTIFIER",
			);
		}
	});
});
