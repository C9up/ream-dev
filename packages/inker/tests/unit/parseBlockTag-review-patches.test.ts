import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { parseBlockTag } from "../../src/parseBlockTag.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

describe("parseBlockTag — component arg value scanner respects brackets (53.3-P1)", () => {
	it("parses a value path containing a comma inside a bracket-string", () => {
		const node = parseBlockTag(
			`component 'card' { title: items["a,b"].title }`,
			1,
			1,
		);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args.length).toBe(1);
		expect(node.args[0]?.key).toBe("title");
		expect(node.args[0]?.source).toBe(`items["a,b"].title`);
	});

	it("parses a value path containing a closing brace inside a bracket-string", () => {
		const node = parseBlockTag(
			`component 'card' { title: items["a}b"].title }`,
			1,
			1,
		);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args[0]?.source).toBe(`items["a}b"].title`);
	});

	it("parses two args where the first has a bracket-string with a comma", () => {
		const node = parseBlockTag(
			`component 'card' { a: rows["x,y"].name, b: page.title }`,
			1,
			1,
		);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args.length).toBe(2);
		expect(node.args[0]?.key).toBe("a");
		expect(node.args[0]?.source).toBe(`rows["x,y"].name`);
		expect(node.args[1]?.key).toBe("b");
		expect(node.args[1]?.source).toBe("page.title");
	});

	it("honors single-quote strings inside brackets", () => {
		const node = parseBlockTag(`component 'card' { v: rows['a,b'] }`, 1, 1);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args[0]?.source).toBe(`rows['a,b']`);
	});

	it("honors backslash-escaped string delimiter inside brackets", () => {
		const node = parseBlockTag(`component 'card' { v: rows["a\\"b,c"] }`, 1, 1);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args[0]?.source).toBe(`rows["a\\"b,c"]`);
	});
});

describe("parseBlockTag — prototype-pollution keys rejected (53.3-P2)", () => {
	for (const key of ["__proto__", "constructor", "prototype"]) {
		it(`rejects '${key}' as a component arg key`, () => {
			try {
				parseBlockTag(`component 'card' { ${key}: user.payload }`, 1, 1);
				expect.fail("should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(InkerRenderError);
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_INVALID_EXPRESSION",
				);
				expect(asTyped<InkerRenderError>(e).message).toMatch(
					/prototype-pollution surface/,
				);
			}
		});

		it(`rejects '${key}' as an each binding`, () => {
			try {
				parseBlockTag(`each items as ${key}`, 1, 1);
				expect.fail("should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(InkerRenderError);
				expect(asTyped<InkerRenderError>(e).code).toBe(
					"E_INKER_INVALID_EXPRESSION",
				);
				expect(asTyped<InkerRenderError>(e).message).toMatch(
					/prototype-pollution surface/,
				);
			}
		});
	}

	it("still accepts a normal key alongside denylisted names", () => {
		const node = parseBlockTag(`component 'card' { title: page.title }`, 1, 1);
		expect(node.kind).toBe("Component");
		if (node.kind !== "Component") throw new Error("unreachable");
		expect(node.args[0]?.key).toBe("title");
	});
});

describe("parseBlockTag — 'as' is reserved as a binding name (53.3-P3)", () => {
	it("rejects {% each items as as %}", () => {
		try {
			parseBlockTag(`each items as as`, 1, 1);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_INVALID_EXPRESSION",
			);
			expect(asTyped<InkerRenderError>(e).message).toMatch(/reserved word/);
		}
	});

	it("still accepts a path containing 'as' inside an identifier", () => {
		const node = parseBlockTag(`each lastNames as name`, 1, 1);
		expect(node.kind).toBe("BlockOpenEach");
		if (node.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(node.binding).toEqual({ kind: "Single", name: "name" });
	});
});
