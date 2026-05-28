import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse } from "../../src/parse.js";
import { parseBlockTag } from "../../src/parseBlockTag.js";
import { parseExpression } from "../../src/parseExpression.js";
import { parsePath } from "../../src/parsePath.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

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

// P2 — lex interpolation scanner string-aware on `}}`
describe("chunk1 P2 — lex `}}` inside string literal does not close", () => {
	it('accepts `{{ items["a}}b"] }}`', () => {
		const tokens = lex(`{{ items["a}}b"] }}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: `items["a}}b"]`,
		});
	});

	it('accepts `{{{ items["}}"] }}}` (raw)', () => {
		const tokens = lex(`{{{ items["}}"] }}}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_RAW",
			expression: `items["}}"]`,
		});
	});

	it("respects backslash-escape inside string", () => {
		const tokens = lex(`{{ items["a\\"b"] }}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			expression: `items["a\\"b"]`,
		});
	});
});

// P3 — lex block-tag scanner string-aware on `%}`
describe("chunk1 P3 — lex `%}` inside string literal does not close", () => {
	it('accepts `{% include "x %} y" %}`', () => {
		const tokens = lex(`{% include "x %} y" %}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "BLOCK_TAG",
			raw: `include "x %} y"`,
		});
	});

	it("respects single-quote inside block tag", () => {
		const tokens = lex(`{% each items['x %} y'] as item %}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "BLOCK_TAG",
			raw: `each items['x %} y'] as item`,
		});
	});
});

// P4 — parseEachTag string-aware `as` location
describe("chunk1 P4 — parseEachTag does not split on `as` inside string literals", () => {
	it('parses `each helper(" as data") as item` correctly', () => {
		const helpers = new Set(["helper"]);
		const result = parseBlockTag(`each helper(" as data") as item`, 1, 1, {
			helpers,
		});
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`helper(" as data")`);
		expect(result.binding).toEqual({ kind: "Single", name: "item" });
	});

	it("parses `each items[' as '] as item` correctly", () => {
		const result = parseBlockTag(`each items[' as '] as item`, 1, 1, {});
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`items[' as ']`);
		expect(result.binding).toEqual({ kind: "Single", name: "item" });
	});

	it("does NOT see `as` inside an object-literal arg of a call", () => {
		const helpers = new Set(["t"]);
		const result = parseBlockTag(`each t({ k: 'as v' }) as row`, 1, 1, {
			helpers,
		});
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`t({ k: 'as v' })`);
	});
});

// P5 — deep-freeze leaf expression nodes
describe("chunk1 P5 — leaf expression nodes are frozen", () => {
	it("Path expression is frozen", () => {
		const expr = parseExpression("user.name", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
	});

	it("Literal expression is frozen", () => {
		const expr = parseExpression("'hello'", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
	});

	it("Binary expression is frozen recursively", () => {
		const expr = parseExpression("a == b && c", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
		if (expr.kind !== "Binary") throw new Error("unreachable");
		expect(Object.isFrozen(expr.left)).toBe(true);
		expect(Object.isFrozen(expr.right)).toBe(true);
	});

	it("Object expression and each entry are frozen", () => {
		const expr = parseExpression("{ a: 1, b: 2 }", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
		if (expr.kind !== "Object") throw new Error("unreachable");
		expect(Object.isFrozen(expr.entries)).toBe(true);
		for (const entry of expr.entries) {
			expect(Object.isFrozen(entry)).toBe(true);
		}
	});

	it("Group expression is frozen", () => {
		const expr = parseExpression("(a || b)", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
	});

	it("Unary expression is frozen", () => {
		const expr = parseExpression("!user.banned", 1, 1);
		expect(Object.isFrozen(expr)).toBe(true);
	});
});

// P6 — exprLine/exprColumn tracks first non-whitespace char inside `{{ … }}`
describe("chunk1 P6 — interpolation exprLine/exprColumn aligns with content start", () => {
	it("single-line: `{{ x }}` puts exprColumn at the `x`", () => {
		const tokens = lex(`{{ x }}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			line: 1,
			column: 1, // `{{` is at col 1
			exprLine: 1,
			exprColumn: 4, // `x` is at col 4
		});
	});

	it("multi-line: `{{\\n    foo\\n}}` reports foo at line 2", () => {
		const tokens = lex(`{{\n    foo\n}}`);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			kind: "INTERP_ESCAPED",
			line: 1,
			column: 1,
			exprLine: 2,
			exprColumn: 5,
		});
	});

	it("propagates exprLine to parseExpression errors", () => {
		// `{{ \n   @bogus }}` — `@` is invalid; error should report line 2,
		// not line 1 (the `{{` position).
		try {
			parse(lex(`{{\n   @bogus }}`));
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.context.line).toBe(2);
			expect(err.context.column).toBe(4);
		}
	});
});

// P7 — dead `!` handler in parsePrimary removed
describe("chunk1 P7 — `!` still works through parseUnary", () => {
	it("parses `!a`", () => {
		const expr = parseExpression("!a", 1, 1);
		expect(expr).toMatchObject({ kind: "Unary", op: "!" });
	});

	it("parses `!!a`", () => {
		const expr = parseExpression("!!a", 1, 1);
		expect(expr).toMatchObject({ kind: "Unary", op: "!" });
	});

	it("rejects `!=` as binary at start", () => {
		expectThrow(() => parseExpression("!= b", 1, 1), "E_INKER_PARSE_ERROR");
	});
});

// P8/P9 — validatePathName extended guards
describe("chunk1 P8/P9 — validatePathName rejects sandbox-escape forms", () => {
	it("rejects bare drive `C:foo`", () => {
		expectThrow(
			() => parseBlockTag(`include 'C:foo'`, 1, 1, {}),
			"E_INKER_PARSE_ERROR",
			"absolute path",
		);
	});

	it("rejects tilde-prefix `~/foo`", () => {
		expectThrow(
			() => parseBlockTag(`include '~/foo'`, 1, 1, {}),
			"E_INKER_PARSE_ERROR",
			"tilde",
		);
	});

	it("rejects empty segment `foo//bar`", () => {
		expectThrow(
			() => parseBlockTag(`include 'foo//bar'`, 1, 1, {}),
			"E_INKER_PARSE_ERROR",
			"empty path segments",
		);
	});

	it("rejects `.` segment `foo/./bar`", () => {
		expectThrow(
			() => parseBlockTag(`include 'foo/./bar'`, 1, 1, {}),
			"E_INKER_PARSE_ERROR",
			"'.' segments",
		);
	});

	it("rejects trailing slash `foo/`", () => {
		expectThrow(
			() => parseBlockTag(`include 'foo/'`, 1, 1, {}),
			"E_INKER_PARSE_ERROR",
			"empty path segments",
		);
	});

	it("still accepts well-formed `foo/bar/baz`", () => {
		const node = parseBlockTag(`include 'foo/bar/baz'`, 1, 1, {});
		expect(node.kind).toBe("Partial");
	});
});

// P10 — `\r` is invisible to position tracking
describe("chunk1 P10 — CR is invisible to column counting", () => {
	it("`\\r\\n{{ x }}` still reports `{{` at line 2 column 1", () => {
		const tokens = lex(`\r\n{{ x }}`);
		// Leading `\r\n` is its own TEXT token (lex preserves raw text).
		expect(tokens).toHaveLength(2);
		expect(tokens[0]).toMatchObject({ kind: "TEXT", value: "\r\n" });
		expect(tokens[1]).toMatchObject({
			kind: "INTERP_ESCAPED",
			line: 2,
			column: 1, // The `{{` sits at column 1 of line 2 — NOT column 2.
		});
	});

	it("`a\\r\\nb{{ x }}` puts `{{` at line 2 column 2", () => {
		const tokens = lex(`a\r\nb{{ x }}`);
		expect(tokens).toHaveLength(2);
		expect(tokens[0]).toMatchObject({ kind: "TEXT", value: "a\r\nb" });
		expect(tokens[1]).toMatchObject({
			kind: "INTERP_ESCAPED",
			line: 2,
			column: 2,
		});
	});

	it("pre-P10 (no CR fix) would have reported column 2 on line 2 instead of 1", () => {
		// Sentinel: with `\r` bumping column, the position of `{{` after a sole
		// `\r\n` prefix would have been column 2 (CR=col2 → LF resets line+col).
		// We assert the post-patch state directly.
		const tokens = lex(`\r\n{{ y }}`);
		expect(tokens[1]).toMatchObject({ line: 2, column: 1 });
	});
});

// P11 — isWhitespaceOnly is strict ASCII (no BOM)
describe("chunk1 P11 — isWhitespaceOnly strict ASCII (BOM rejected)", () => {
	it("BOM-prefixed text BEFORE `{% layout %}` triggers INVALID_LAYOUT_POSITION", () => {
		// Pre-P11: BOM was silently treated as whitespace, allowing the layout.
		// Post-P11: BOM is non-whitespace content, so the layout-must-be-first
		// invariant fires and the author gets a clear error instead of a silent
		// pass-through that breaks later loaders.
		try {
			parse(lex(`﻿{% layout 'main' %}`));
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			expect(asTyped<InkerRenderError>(e).code).toBe(
				"E_INKER_INVALID_LAYOUT_POSITION",
			);
		}
	});
});

// P12 — number literals rejected when magnitude > MAX_SAFE_INTEGER
describe("chunk1 P12 — number-magnitude + leading-zero guards", () => {
	it("rejects literal > Number.MAX_SAFE_INTEGER", () => {
		expectThrow(
			() => parseExpression("9007199254740993", 1, 1),
			"E_INKER_PARSE_ERROR",
			"MAX_SAFE_INTEGER",
		);
	});

	it("rejects negative literal < -Number.MAX_SAFE_INTEGER", () => {
		expectThrow(
			() => parseExpression("-9007199254740993", 1, 1),
			"E_INKER_PARSE_ERROR",
			"MAX_SAFE_INTEGER",
		);
	});

	it("accepts Number.MAX_SAFE_INTEGER exactly", () => {
		const expr = parseExpression("9007199254740991", 1, 1);
		expect(expr).toMatchObject({
			kind: "Literal",
			value: 9007199254740991,
		});
	});

	it("rejects bracket index with leading zero `items[007]`", () => {
		expectThrow(
			() => parsePath("items[007]", 1, 1),
			"E_INKER_PARSE_ERROR",
			"leading zeros",
		);
	});

	it("rejects bracket index > MAX_SAFE_INTEGER", () => {
		expectThrow(
			() => parsePath("items[99999999999999999999]", 1, 1),
			"E_INKER_PARSE_ERROR",
			"MAX_SAFE_INTEGER",
		);
	});

	it("still accepts `items[0]` (single zero)", () => {
		const path = parsePath("items[0]", 1, 1);
		expect(path).toEqual(["items", 0]);
	});

	it("still accepts `items[42]`", () => {
		const path = parsePath("items[42]", 1, 1);
		expect(path).toEqual(["items", 42]);
	});
});

// Defensive: keep the new findTopLevelAs scanner from regressing on
// hostile-looking bracket combos.
describe("chunk1 P4 — findTopLevelAs depth tracking", () => {
	it('handles chained bracket-string access `each items["k"]["v"] as item`', () => {
		const result = parseBlockTag(`each items["k"]["v"] as item`, 1, 1, {});
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`items["k"]["v"]`);
		expect(result.binding).toEqual({ kind: "Single", name: "item" });
	});

	it("handles destructured binding `each obj as [k, v]`", () => {
		const result = parseBlockTag(`each obj as [k, v]`, 1, 1, {});
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`obj`);
		expect(result.binding).toEqual({
			kind: "Destructured",
			names: ["k", "v"],
		});
	});

	it("handles destructured binding when iterable carries a string with `as`", () => {
		// Cross-check P4 + destructuring: the inner ` as ` must not split.
		const result = parseBlockTag(
			`each items[' as embedded'] as [k, v]`,
			1,
			1,
			{},
		);
		expect(result.kind).toBe("BlockOpenEach");
		if (result.kind !== "BlockOpenEach") throw new Error("unreachable");
		expect(result.iterableSource).toBe(`items[' as embedded']`);
		expect(result.binding).toEqual({
			kind: "Destructured",
			names: ["k", "v"],
		});
	});
});
