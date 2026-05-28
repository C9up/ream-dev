import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { parseExpression } from "../../src/parseExpression.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

function expectThrow(
	source: string,
	code: string,
	messageSubstring?: string,
	helpers?: ReadonlySet<string>,
): void {
	try {
		parseExpression(source, 1, 1, { helpers });
		expect.fail(`should have thrown for '${source}'`);
	} catch (e) {
		expect(e).toBeInstanceOf(InkerRenderError);
		const err = asTyped<InkerRenderError>(e);
		expect(err.code).toBe(code);
		if (messageSubstring !== undefined) {
			expect(err.message).toContain(messageSubstring);
		}
	}
}

describe("parseExpression — literals", () => {
	it("parses a single-quote string literal", () => {
		const expr = parseExpression("'hello'", 1, 1);
		expect(expr).toMatchObject({ kind: "Literal", value: "hello" });
	});

	it("parses a double-quote string literal", () => {
		const expr = parseExpression('"world"', 1, 1);
		expect(expr).toMatchObject({ kind: "Literal", value: "world" });
	});

	it("parses string escape sequences \\n \\t \\\\ \\' \\\"", () => {
		expect(parseExpression("'a\\nb'", 1, 1)).toMatchObject({
			kind: "Literal",
			value: "a\nb",
		});
		expect(parseExpression("'a\\tb'", 1, 1)).toMatchObject({
			kind: "Literal",
			value: "a\tb",
		});
		expect(parseExpression("'a\\\\b'", 1, 1)).toMatchObject({
			kind: "Literal",
			value: "a\\b",
		});
		expect(parseExpression("'it\\'s'", 1, 1)).toMatchObject({
			kind: "Literal",
			value: "it's",
		});
		expect(parseExpression('"\\"hi\\""', 1, 1)).toMatchObject({
			kind: "Literal",
			value: '"hi"',
		});
	});

	it("rejects unsupported string escapes", () => {
		expectThrow("'\\x'", "E_INKER_PARSE_ERROR", "unsupported escape");
	});

	it("rejects unterminated string literal", () => {
		expectThrow("'hello", "E_INKER_PARSE_ERROR", "unterminated");
	});

	it("parses integer number literals", () => {
		expect(parseExpression("42", 1, 1)).toMatchObject({
			kind: "Literal",
			value: 42,
		});
		expect(parseExpression("0", 1, 1)).toMatchObject({
			kind: "Literal",
			value: 0,
		});
	});

	it("parses decimal number literals", () => {
		expect(parseExpression("3.14", 1, 1)).toMatchObject({
			kind: "Literal",
			value: 3.14,
		});
		expect(parseExpression("0.5", 1, 1)).toMatchObject({
			kind: "Literal",
			value: 0.5,
		});
	});

	it("parses leading-minus number literals", () => {
		expect(parseExpression("-7", 1, 1)).toMatchObject({
			kind: "Literal",
			value: -7,
		});
		expect(parseExpression("-0.5", 1, 1)).toMatchObject({
			kind: "Literal",
			value: -0.5,
		});
	});

	it("rejects exotic numeric forms", () => {
		expectThrow("0x1", "E_INKER_PARSE_ERROR", "invalid number");
		expectThrow("1e5", "E_INKER_PARSE_ERROR", "invalid number");
		expectThrow("1n", "E_INKER_PARSE_ERROR", "invalid number");
		expectThrow("3.4.5", "E_INKER_PARSE_ERROR");
	});

	it("rejects standalone unary minus", () => {
		expectThrow("-a", "E_INKER_PARSE_ERROR", "unary minus");
	});

	it("parses keyword literals true/false/null/undefined", () => {
		expect(parseExpression("true", 1, 1)).toMatchObject({
			kind: "Literal",
			value: true,
		});
		expect(parseExpression("false", 1, 1)).toMatchObject({
			kind: "Literal",
			value: false,
		});
		expect(parseExpression("null", 1, 1)).toMatchObject({
			kind: "Literal",
			value: null,
		});
		expect(parseExpression("undefined", 1, 1)).toMatchObject({
			kind: "Literal",
			value: undefined,
		});
	});
});

describe("parseExpression — paths", () => {
	it("parses bare identifier as Path", () => {
		expect(parseExpression("foo", 1, 1)).toMatchObject({
			kind: "Path",
			path: ["foo"],
		});
	});

	it("parses dotted path", () => {
		expect(parseExpression("user.name", 1, 1)).toMatchObject({
			kind: "Path",
			path: ["user", "name"],
		});
	});

	it("parses bracket-string access", () => {
		expect(parseExpression('items["a"]', 1, 1)).toMatchObject({
			kind: "Path",
			path: ["items", "a"],
		});
	});

	it("parses bracket-integer index access", () => {
		expect(parseExpression("items[3]", 1, 1)).toMatchObject({
			kind: "Path",
			path: ["items", 3],
		});
	});
});

describe("parseExpression — calls", () => {
	const helpers: ReadonlySet<string> = new Set([
		"t",
		"csrfField",
		"url",
		"asset",
	]);

	it("parses zero-arg call", () => {
		expect(parseExpression("csrfField()", 1, 1, { helpers })).toMatchObject({
			kind: "Call",
			name: "csrfField",
			args: [],
		});
	});

	it("parses single-arg call with string literal", () => {
		expect(parseExpression("t('greeting')", 1, 1, { helpers })).toMatchObject({
			kind: "Call",
			name: "t",
			args: [{ kind: "Literal", value: "greeting" }],
		});
	});

	it("parses multi-arg call with mixed types", () => {
		const expr = parseExpression("t('greeting', user)", 1, 1, { helpers });
		expect(expr).toMatchObject({
			kind: "Call",
			name: "t",
			args: [
				{ kind: "Literal", value: "greeting" },
				{ kind: "Path", path: ["user"] },
			],
		});
	});

	it("rejects unknown helper at parse time with hint listing names", () => {
		try {
			parseExpression("bogus()", 1, 1, { helpers });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNKNOWN_HELPER");
			expect(err.message).toContain("bogus");
			expect(err.message).toContain("registered helpers");
			// Helpers listed alphabetically (limit 5).
			expect(err.message).toContain("asset");
			expect(err.message).toContain("csrfField");
		}
	});

	it("rejects unknown helper with empty-registry hint", () => {
		try {
			parseExpression("anything()", 1, 1, { helpers: new Set() });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_UNKNOWN_HELPER");
			expect(err.message).toContain("no helpers are registered");
		}
	});

	it("rejects empty argument position", () => {
		expectThrow(
			"t(a, , b)",
			"E_INKER_PARSE_ERROR",
			"empty argument position",
			helpers,
		);
	});

	it("rejects trailing comma in call args", () => {
		expectThrow("t(a,)", "E_INKER_PARSE_ERROR", "trailing comma", helpers);
	});

	it("rejects unterminated call args", () => {
		expectThrow("t(a", "E_INKER_PARSE_ERROR", undefined, helpers);
	});
});

describe("parseExpression — object literals", () => {
	it("parses empty object", () => {
		expect(parseExpression("{}", 1, 1)).toMatchObject({
			kind: "Object",
			entries: [],
		});
	});

	it("parses single-pair object", () => {
		expect(parseExpression("{ a: 1 }", 1, 1)).toMatchObject({
			kind: "Object",
			entries: [
				{
					key: "a",
					value: { kind: "Literal", value: 1 },
					shorthand: false,
				},
			],
		});
	});

	it("parses shorthand `{ name }` as Path-valued entry", () => {
		expect(parseExpression("{ name }", 1, 1)).toMatchObject({
			kind: "Object",
			entries: [
				{
					key: "name",
					value: { kind: "Path", path: ["name"] },
					shorthand: true,
				},
			],
		});
	});

	it("parses mixed shorthand + long-form", () => {
		expect(parseExpression("{ a: 1, b }", 1, 1)).toMatchObject({
			kind: "Object",
			entries: [
				{ key: "a", shorthand: false },
				{ key: "b", shorthand: true },
			],
		});
	});

	it("accepts trailing comma", () => {
		const expr = parseExpression("{ a: 1, }", 1, 1);
		expect(expr.kind).toBe("Object");
	});

	it("rejects duplicate keys", () => {
		// P1: duplicate-key is a grammar-axis violation (PARSE_ERROR), not a
		// semantic-denylist violation like prototype-pollution (INVALID_EXPRESSION).
		expectThrow("{ a: 1, a: 2 }", "E_INKER_PARSE_ERROR", "duplicate");
	});

	it("rejects prototype-pollution keys", () => {
		expectThrow(
			"{ __proto__: 1 }",
			"E_INKER_INVALID_EXPRESSION",
			"prototype-pollution",
		);
		expectThrow(
			"{ constructor: 1 }",
			"E_INKER_INVALID_EXPRESSION",
			"prototype-pollution",
		);
		expectThrow(
			"{ prototype: 1 }",
			"E_INKER_INVALID_EXPRESSION",
			"prototype-pollution",
		);
	});

	it("rejects dotted shorthand value", () => {
		expectThrow("{ user.name }", "E_INKER_PARSE_ERROR", "shorthand");
	});

	it("rejects unterminated object", () => {
		expectThrow("{ a: 1", "E_INKER_PARSE_ERROR", "',' or '}'");
	});

	it("rejects leading comma", () => {
		expectThrow("{ , a: 1 }", "E_INKER_PARSE_ERROR", "leading comma");
	});
});

describe("parseExpression — unary", () => {
	it("parses `!path`", () => {
		expect(parseExpression("!user.banned", 1, 1)).toMatchObject({
			kind: "Unary",
			op: "!",
			operand: { kind: "Path", path: ["user", "banned"] },
		});
	});

	it("parses double negation `!!x`", () => {
		expect(parseExpression("!!a", 1, 1)).toMatchObject({
			kind: "Unary",
			op: "!",
			operand: {
				kind: "Unary",
				op: "!",
				operand: { kind: "Path", path: ["a"] },
			},
		});
	});

	it("rejects trailing `!`", () => {
		expectThrow("!", "E_INKER_PARSE_ERROR");
	});
});

describe("parseExpression — binary", () => {
	it("parses `a == b`", () => {
		expect(parseExpression("a == b", 1, 1)).toMatchObject({
			kind: "Binary",
			op: "==",
			left: { kind: "Path", path: ["a"] },
			right: { kind: "Path", path: ["b"] },
		});
	});

	it("parses each comparator", () => {
		for (const op of ["==", "!=", "===", "!==", "<", "<=", ">", ">="]) {
			const expr = parseExpression(`a ${op} b`, 1, 1);
			expect(expr).toMatchObject({ kind: "Binary", op });
		}
	});

	it("parses logical `&&` / `||`", () => {
		expect(parseExpression("a && b", 1, 1)).toMatchObject({
			kind: "Binary",
			op: "&&",
		});
		expect(parseExpression("a || b", 1, 1)).toMatchObject({
			kind: "Binary",
			op: "||",
		});
	});

	it("respects precedence: `a == b && c` → `(a == b) && c`", () => {
		const expr = parseExpression("a == b && c", 1, 1);
		expect(expr).toMatchObject({
			kind: "Binary",
			op: "&&",
			left: { kind: "Binary", op: "==" },
			right: { kind: "Path", path: ["c"] },
		});
	});

	it("respects precedence: `a || b && c` → `a || (b && c)`", () => {
		const expr = parseExpression("a || b && c", 1, 1);
		expect(expr).toMatchObject({
			kind: "Binary",
			op: "||",
			left: { kind: "Path", path: ["a"] },
			right: { kind: "Binary", op: "&&" },
		});
	});

	it("is left-associative within the same precedence", () => {
		const expr = parseExpression("a && b && c", 1, 1);
		expect(expr).toMatchObject({
			kind: "Binary",
			op: "&&",
			left: { kind: "Binary", op: "&&" },
			right: { kind: "Path", path: ["c"] },
		});
	});

	it("rejects bare `=`", () => {
		expectThrow("a = b", "E_INKER_PARSE_ERROR", "'=='");
	});

	it("rejects bitwise `&`", () => {
		expectThrow("a & b", "E_INKER_PARSE_ERROR", "bitwise");
	});

	it("rejects bitwise `|`", () => {
		expectThrow("a | b", "E_INKER_PARSE_ERROR", "bitwise");
	});
});

describe("parseExpression — grouping", () => {
	it("parses `(a)` as Group", () => {
		expect(parseExpression("(a)", 1, 1)).toMatchObject({
			kind: "Group",
			expression: { kind: "Path", path: ["a"] },
		});
	});

	it("groups change precedence: `(a || b) && c`", () => {
		const expr = parseExpression("(a || b) && c", 1, 1);
		expect(expr).toMatchObject({
			kind: "Binary",
			op: "&&",
			left: {
				kind: "Group",
				expression: { kind: "Binary", op: "||" },
			},
			right: { kind: "Path", path: ["c"] },
		});
	});

	it("rejects unterminated grouping", () => {
		expectThrow("(a + b", "E_INKER_PARSE_ERROR");
	});
});

describe("parseExpression — error cases", () => {
	it("rejects empty source", () => {
		expectThrow("", "E_INKER_PARSE_ERROR", "Empty expression");
	});

	it("rejects unexpected character at start", () => {
		expectThrow("@foo", "E_INKER_PARSE_ERROR", "unexpected character");
	});

	it("rejects trailing content", () => {
		expectThrow("a b", "E_INKER_PARSE_ERROR", "trailing content");
	});

	it("rejects array literal in expression position", () => {
		expectThrow("[1, 2]", "E_INKER_PARSE_ERROR", "array literals");
	});

	// P21 — AC2-mandated parse-error cases that weren't yet pinned.
	it("rejects trailing binary operator (no right operand)", () => {
		expectThrow("a ==", "E_INKER_PARSE_ERROR");
	});

	it("rejects missing left operand for binary operator", () => {
		expectThrow("== b", "E_INKER_PARSE_ERROR");
	});

	it("rejects bare '=' (use '==' or '===')", () => {
		expectThrow("a = b", "E_INKER_PARSE_ERROR", "'=='");
	});

	it("rejects bitwise '&' (use '&&')", () => {
		expectThrow("a & b", "E_INKER_PARSE_ERROR", "&&");
	});
});

describe("parseExpression — path scanner guards (P14)", () => {
	it("rejects unterminated '[' in path expression", () => {
		expectThrow("items[unclosed", "E_INKER_PARSE_ERROR", "unterminated '['");
	});

	it("rejects unterminated nested '[[' in path", () => {
		expectThrow("a[b[", "E_INKER_PARSE_ERROR", "unterminated '['");
	});
});

describe("parseExpression — object shorthand keyword guard (P20)", () => {
	it("rejects {true} shorthand (silent shadowing of literal)", () => {
		const helpers = new Set(["t"]);
		expectThrow(
			"t({true})",
			"E_INKER_INVALID_EXPRESSION",
			"shadows a literal/reserved keyword",
			helpers,
		);
	});

	it("rejects {undefined} shorthand", () => {
		const helpers = new Set(["t"]);
		expectThrow(
			"t({undefined})",
			"E_INKER_INVALID_EXPRESSION",
			"shadows a literal/reserved keyword",
			helpers,
		);
	});

	it("rejects {as} shorthand (reserved binding name)", () => {
		const helpers = new Set(["t"]);
		expectThrow(
			"t({as})",
			"E_INKER_INVALID_EXPRESSION",
			"shadows a literal/reserved keyword",
			helpers,
		);
	});

	it("still accepts explicit `true: value` form", () => {
		const helpers = new Set(["t"]);
		const expr = parseExpression("t({true: 1})", 1, 1, { helpers });
		expect(expr).toMatchObject({ kind: "Call", name: "t" });
	});
});
