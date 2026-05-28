import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { parseBlockTag } from "../../src/parseBlockTag.js";
import { asTyped } from "../__helpers__/bypass-type-check.js";

function expectThrow(
	raw: string,
	code: string,
	messageSubstring?: string,
): void {
	try {
		parseBlockTag(raw, 1, 1);
		expect.fail(`should have thrown for raw='${raw}'`);
	} catch (e) {
		expect(e).toBeInstanceOf(InkerRenderError);
		const err = asTyped<InkerRenderError>(e);
		expect(err.code).toBe(code);
		if (messageSubstring !== undefined) {
			expect(err.message).toContain(messageSubstring);
		}
	}
}

describe("parseBlockTag", () => {
	describe("accepted forms", () => {
		it("layout 'main'", () => {
			expect(parseBlockTag("layout 'main'", 1, 1)).toMatchObject({
				kind: "Layout",
				name: "main",
				raw: "layout 'main'",
			});
		});

		it('layout "main"', () => {
			expect(parseBlockTag('layout "main"', 1, 1)).toMatchObject({
				kind: "Layout",
				name: "main",
			});
		});

		it("include 'partials/header'", () => {
			expect(parseBlockTag("include 'partials/header'", 1, 1)).toMatchObject({
				kind: "Partial",
				name: "partials/header",
			});
		});

		it('include "partials/header"', () => {
			expect(parseBlockTag('include "partials/header"', 1, 1)).toMatchObject({
				kind: "Partial",
				name: "partials/header",
			});
		});

		it("tolerates extra whitespace around keyword and name", () => {
			expect(parseBlockTag("  layout   'main'  ", 1, 1)).toMatchObject({
				kind: "Layout",
				name: "main",
			});
		});

		it("tolerates newlines between keyword and name", () => {
			expect(parseBlockTag("layout\n'main'", 1, 1)).toMatchObject({
				kind: "Layout",
				name: "main",
			});
		});

		it("identifier fuzz — `a`, `a-b`, `a_b`, `foo/bar/baz`, `A`", () => {
			for (const name of ["a", "a-b", "a_b", "foo/bar/baz", "A"]) {
				expect(parseBlockTag(`layout '${name}'`, 1, 1)).toMatchObject({
					kind: "Layout",
					name,
				});
			}
		});

		it("accepts numeric-leading name (validateName has no leading-letter rule)", () => {
			expect(parseBlockTag("layout '1bad'", 1, 1)).toMatchObject({
				kind: "Layout",
				name: "1bad",
			});
		});

		it("escape \\\\ in single-quoted name produces literal backslash (rejected at validation)", () => {
			expectThrow(
				"include 'partials\\\\header'",
				"E_INKER_PARSE_ERROR",
				"forward slashes",
			);
		});
	});

	describe("rejected forms", () => {
		it("bare layout (no name)", () => {
			expectThrow("layout", "E_INKER_PARSE_ERROR", "requires a quoted");
		});

		it("bare include (no name)", () => {
			expectThrow("include", "E_INKER_PARSE_ERROR", "requires a quoted");
		});

		it("component card → parse error (missing quoted name)", () => {
			expectThrow("component card", "E_INKER_PARSE_ERROR", "quoted");
		});

		it("unknownThing → unknown directive (not in rejected-list)", () => {
			expectThrow(
				"unknownThing 'x'",
				"E_INKER_UNKNOWN_DIRECTIVE",
				"'unknownThing'",
			);
		});

		it("mismatched quotes `layout 'main\"`", () => {
			expectThrow(`layout 'main"`, "E_INKER_PARSE_ERROR");
		});

		it("trailing junk after layout name", () => {
			expectThrow(
				"layout 'main' extra",
				"E_INKER_PARSE_ERROR",
				"Unexpected tokens",
			);
		});

		it("empty name `layout ''`", () => {
			expectThrow("layout ''", "E_INKER_PARSE_ERROR", "non-empty");
		});

		it("NUL byte in name", () => {
			expectThrow(
				"include 'partials/\0header'",
				"E_INKER_PARSE_ERROR",
				"NUL byte",
			);
		});

		it("`..` segment in name", () => {
			expectThrow("include '../etc'", "E_INKER_PARSE_ERROR", "'..'");
		});

		it("absolute path (leading /)", () => {
			expectThrow("include '/etc/passwd'", "E_INKER_PARSE_ERROR", "absolute");
		});

		it("escape sequence `\\n` inside name", () => {
			expectThrow(
				"include 'name\\nbad'",
				"E_INKER_PARSE_ERROR",
				"unsupported escape sequence",
			);
		});

		it("unsupported keyword `extends` (rejected-list)", () => {
			expectThrow("extends 'x'", "E_INKER_UNKNOWN_DIRECTIVE", "'extends'");
		});

		it("unsupported keyword `section` (rejected-list)", () => {
			expectThrow("section 'body'", "E_INKER_UNKNOWN_DIRECTIVE", "'section'");
		});
	});

	// --- 53.3 control-flow + component grammar ---

	describe("if directive (53.3)", () => {
		it("emits BlockOpenIf for a simple path expression", () => {
			expect(parseBlockTag("if user.admin", 1, 1)).toMatchObject({
				kind: "BlockOpenIf",
				condition: {
					expression: { kind: "Path", path: ["user", "admin"] },
					source: "user.admin",
				},
			});
		});

		it("emits BlockOpenIf with Unary negation for leading '!'", () => {
			expect(parseBlockTag("if !user.banned", 1, 1)).toMatchObject({
				kind: "BlockOpenIf",
				condition: {
					expression: {
						kind: "Unary",
						op: "!",
						operand: { kind: "Path", path: ["user", "banned"] },
					},
				},
			});
		});

		it("tolerates whitespace around '!' and the path", () => {
			expect(parseBlockTag("if  !  user.admin  ", 1, 1)).toMatchObject({
				kind: "BlockOpenIf",
				condition: {
					expression: {
						kind: "Unary",
						op: "!",
						operand: { kind: "Path", path: ["user", "admin"] },
					},
				},
			});
		});

		it("accepts comparator `==` (lifted from 53.3 D1)", () => {
			expect(parseBlockTag("if x == 1", 1, 1)).toMatchObject({
				kind: "BlockOpenIf",
				condition: {
					expression: {
						kind: "Binary",
						op: "==",
						left: { kind: "Path", path: ["x"] },
						right: { kind: "Literal", value: 1 },
					},
				},
			});
		});

		it("accepts logical `&&` (lifted from 53.3 D1)", () => {
			expect(parseBlockTag("if a && b", 1, 1)).toMatchObject({
				kind: "BlockOpenIf",
				condition: {
					expression: {
						kind: "Binary",
						op: "&&",
					},
				},
			});
		});

		it("rejects empty expression", () => {
			expectThrow("if", "E_INKER_INVALID_EXPRESSION", "expression");
		});

		it("rejects bare `!` without expression", () => {
			expectThrow("if !", "E_INKER_PARSE_ERROR");
		});

		it("emits BlockClose for endif", () => {
			expect(parseBlockTag("endif", 1, 1)).toMatchObject({
				kind: "BlockClose",
				closes: "If",
			});
		});

		it("rejects trailing junk after endif", () => {
			expectThrow("endif foo", "E_INKER_PARSE_ERROR", "Unexpected tokens");
		});
	});

	describe("each directive (53.3)", () => {
		it("emits BlockOpenEach for `items as item`", () => {
			expect(parseBlockTag("each items as item", 1, 1)).toMatchObject({
				kind: "BlockOpenEach",
				iterable: { kind: "Path", path: ["items"] },
				binding: { kind: "Single", name: "item" },
			});
		});

		it("emits BlockOpenEach for nested path", () => {
			expect(parseBlockTag("each page.items as row", 1, 1)).toMatchObject({
				kind: "BlockOpenEach",
				iterable: { kind: "Path", path: ["page", "items"] },
				binding: { kind: "Single", name: "row" },
			});
		});

		it("rejects missing 'as'", () => {
			expectThrow("each items item", "E_INKER_INVALID_EXPRESSION", "'as'");
		});

		it("rejects invalid binding identifier", () => {
			expectThrow(
				"each items as 1bad",
				"E_INKER_INVALID_EXPRESSION",
				"identifier",
			);
		});

		it("rejects reserved-word binding", () => {
			expectThrow(
				"each items as for",
				"E_INKER_INVALID_EXPRESSION",
				"reserved",
			);
		});

		it("rejects missing iterable before 'as'", () => {
			expectThrow("each  as item", "E_INKER_INVALID_EXPRESSION", "iterable");
		});

		it("emits BlockClose for endeach", () => {
			expect(parseBlockTag("endeach", 1, 1)).toMatchObject({
				kind: "BlockClose",
				closes: "Each",
			});
		});
	});

	describe("else directive (53.3)", () => {
		it("emits Else", () => {
			expect(parseBlockTag("else", 1, 1)).toMatchObject({ kind: "Else" });
		});

		it("rejects `else if expr` chain", () => {
			expectThrow("else if x", "E_INKER_INVALID_EXPRESSION", "chains");
		});
	});

	describe("component directive (53.3)", () => {
		it("emits Component for empty args literal `{}`", () => {
			expect(parseBlockTag("component 'card' {}", 1, 1)).toMatchObject({
				kind: "Component",
				name: "card",
				args: [],
			});
		});

		it("emits Component with single arg", () => {
			expect(
				parseBlockTag("component 'card' { title: page.title }", 1, 1),
			).toMatchObject({
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

		it("emits Component with multi args + trailing comma", () => {
			expect(
				parseBlockTag(
					"component 'card' { title: page.title, body: page.body, }",
					1,
					1,
				),
			).toMatchObject({
				kind: "Component",
				name: "card",
				args: [
					{
						key: "title",
						value: { kind: "Path", path: ["page", "title"] },
					},
					{
						key: "body",
						value: { kind: "Path", path: ["page", "body"] },
					},
				],
			});
		});

		it("allows omitting the args block entirely", () => {
			expect(parseBlockTag("component 'card'", 1, 1)).toMatchObject({
				kind: "Component",
				name: "card",
				args: [],
			});
		});

		it("rejects duplicate keys", () => {
			// P1: routed through parseExpression — duplicate-key surfaces as
			// E_INKER_PARSE_ERROR (grammar axis) rather than INVALID_EXPRESSION.
			expectThrow(
				"component 'card' { title: a.b, title: c.d }",
				"E_INKER_PARSE_ERROR",
				"duplicate",
			);
		});

		it("accepts literal value (lifted from 53.3 D5)", () => {
			expect(
				parseBlockTag("component 'card' { title: \"Hello\" }", 1, 1),
			).toMatchObject({
				kind: "Component",
				name: "card",
				args: [
					{
						key: "title",
						value: { kind: "Literal", value: "Hello" },
					},
				],
			});
		});

		it("rejects unterminated args literal", () => {
			expectThrow(
				"component 'card' { title: a.b",
				"E_INKER_INVALID_EXPRESSION",
				"'}'",
			);
		});

		it("rejects invalid key", () => {
			expectThrow("component 'card' { 1key: a.b }", "E_INKER_PARSE_ERROR");
		});

		it("rejects missing colon", () => {
			expectThrow(
				"component 'card' { title a.b }",
				"E_INKER_PARSE_ERROR",
				"':'",
			);
		});

		it("rejects path-traversal in component name", () => {
			expectThrow("component '../bad'", "E_INKER_PARSE_ERROR", "'..'");
		});
	});
});
