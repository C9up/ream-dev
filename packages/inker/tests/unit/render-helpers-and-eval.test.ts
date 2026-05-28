import { describe, expect, it } from "vitest";
import { InkerRenderError } from "../../src/InkerRenderError.js";
import { lex } from "../../src/lex.js";
import { parse } from "../../src/parse.js";
import { type HelperFn, renderAst } from "../../src/render.js";
import { SafeString } from "../../src/SafeString.js";
import { asTyped, bypassTypeCheck } from "../__helpers__/bypass-type-check.js";

function renderSrc(
	src: string,
	data: Readonly<Record<string, unknown>>,
	helpers?: ReadonlyMap<string, HelperFn>,
): string {
	const names =
		helpers === undefined ? new Set<string>() : new Set(helpers.keys());
	const ast = parse(lex(src), { helpers: names });
	return renderAst(ast, data, { helpers });
}

describe("evalExpression — Literal arm", () => {
	it("renders string literal", () => {
		expect(renderSrc("{{ 'hello' }}", {})).toBe("hello");
	});

	it("renders number literal", () => {
		expect(renderSrc("{{ 42 }}", {})).toBe("42");
		expect(renderSrc("{{ -3.14 }}", {})).toBe("-3.14");
	});

	it("renders boolean / null / undefined literals", () => {
		expect(renderSrc("{{ true }}", {})).toBe("true");
		expect(renderSrc("{{ false }}", {})).toBe("false");
		expect(renderSrc("{{ null }}", {})).toBe("");
		expect(renderSrc("{{ undefined }}", {})).toBe("");
	});
});

describe("evalExpression — Path arm (backward-compat)", () => {
	it("renders dotted path", () => {
		expect(renderSrc("{{ user.name }}", { user: { name: "Ada" } })).toBe("Ada");
	});

	it("HTML-escapes by default", () => {
		expect(renderSrc("{{ msg }}", { msg: "<b>" })).toBe("&lt;b&gt;");
	});

	it("triple-brace skips escape", () => {
		expect(renderSrc("{{{ msg }}}", { msg: "<b>" })).toBe("<b>");
	});
});

describe("evalExpression — Call arm (helpers)", () => {
	it("invokes registered helper with string literal arg", () => {
		const helpers = new Map<string, HelperFn>([
			["t", (key) => `T:${String(key)}`],
		]);
		expect(renderSrc("{{ t('greeting') }}", {}, helpers)).toBe("T:greeting");
	});

	it("invokes helper with mixed literal and path args", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"t",
				(key, params) => {
					const obj = asTyped<{ name: string }>(params);
					return `${String(key)}:${obj.name}`;
				},
			],
		]);
		expect(
			renderSrc("{{ t('hello', { name }) }}", { name: "Ada" }, helpers),
		).toBe("hello:Ada");
	});

	it("escapes plain-string helper return values", () => {
		const helpers = new Map<string, HelperFn>([["unsafe", () => "<script>"]]);
		expect(renderSrc("{{ unsafe() }}", {}, helpers)).toBe("&lt;script&gt;");
	});

	it("does NOT escape SafeString helper returns", () => {
		const helpers = new Map<string, HelperFn>([
			["csrfField", () => new SafeString('<input type="hidden">')],
		]);
		expect(renderSrc("{{ csrfField() }}", {}, helpers)).toBe(
			'<input type="hidden">',
		);
	});

	it("triple-brace path passing a string returns raw", () => {
		const helpers = new Map<string, HelperFn>([["raw", () => "<b>"]]);
		expect(renderSrc("{{{ raw() }}}", {}, helpers)).toBe("<b>");
	});

	it("wraps helper throws as E_INKER_HELPER_THROW with .cause", () => {
		const original = new Error("boom from helper");
		const helpers = new Map<string, HelperFn>([
			[
				"explode",
				() => {
					throw original;
				},
			],
		]);
		try {
			renderSrc("{{ explode() }}", {}, helpers);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InkerRenderError);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_HELPER_THROW");
			expect(err.message).toContain("explode");
			expect(err.message).toContain("boom from helper");
			expect(err.cause).toBe(original);
		}
	});

	it("resolves helper implementation LIVE (D4) — caller mutating Map mid-render", () => {
		const helpers = new Map<string, HelperFn>([["t", () => "v1"]]);
		const names = new Set(helpers.keys());
		const ast = parse(lex("{{ t() }}"), { helpers: names });
		expect(renderAst(ast, {}, { helpers })).toBe("v1");
		helpers.set("t", () => "v2");
		expect(renderAst(ast, {}, { helpers })).toBe("v2");
	});
});

describe("evalExpression — Unary / Binary / Group", () => {
	it("negates truthy via `!`", () => {
		expect(renderSrc("{{ !x }}", { x: 1 })).toBe("false");
		expect(renderSrc("{{ !x }}", { x: 0 })).toBe("true");
	});

	it("short-circuits `&&` without evaluating right when left falsy", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"willThrow",
				() => {
					throw new Error("should never run");
				},
			],
		]);
		expect(renderSrc("{{ x && willThrow() }}", { x: false }, helpers)).toBe(
			"false",
		);
	});

	it("short-circuits `||` without evaluating right when left truthy", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"willThrow",
				() => {
					throw new Error("should never run");
				},
			],
		]);
		expect(renderSrc("{{ x || willThrow() }}", { x: "value" }, helpers)).toBe(
			"value",
		);
	});

	it("compares with == / === / != / !==", () => {
		expect(renderSrc("{{ '1' == 1 }}", {})).toBe("true");
		expect(renderSrc("{{ '1' === 1 }}", {})).toBe("false");
		expect(renderSrc("{{ a != b }}", { a: 1, b: 2 })).toBe("true");
		expect(renderSrc("{{ a !== b }}", { a: 1, b: 1 })).toBe("false");
	});

	it("compares with < / <= / > / >=", () => {
		expect(renderSrc("{{ a < b }}", { a: 1, b: 2 })).toBe("true");
		expect(renderSrc("{{ a <= b }}", { a: 2, b: 2 })).toBe("true");
		expect(renderSrc("{{ a > b }}", { a: 3, b: 2 })).toBe("true");
		expect(renderSrc("{{ a >= b }}", { a: 1, b: 2 })).toBe("false");
	});

	it("renders grouped expressions correctly", () => {
		expect(renderSrc("{{ (a || b) && c }}", { a: 0, b: 1, c: "x" })).toBe("x");
	});
});

describe("evalExpression — Object arm", () => {
	it("evaluates object literal as helper arg", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"echo",
				(arg) => {
					const obj = asTyped<Record<string, unknown>>(arg);
					return `${String(obj.name)}|${String(obj.count)}`;
				},
			],
		]);
		expect(
			renderSrc("{{ echo({ name: 'Ada', count: 3 }) }}", {}, helpers),
		).toBe("Ada|3");
	});
});

describe("If renderer — full expression conditions", () => {
	it("renders branch when comparator is true", () => {
		expect(
			renderSrc("{% if age >= 18 %}adult{% else %}minor{% endif %}", {
				age: 21,
			}),
		).toBe("adult");
	});

	it("renders else when logical-and false", () => {
		expect(
			renderSrc(
				"{% if user.verified && !user.banned %}ok{% else %}no{% endif %}",
				{ user: { verified: true, banned: true } },
			),
		).toBe("no");
	});
});

describe("Each renderer — destructured binding", () => {
	it("iterates Array-of-pairs with `as [k, v]`", () => {
		expect(
			renderSrc("{% each pairs as [k, v] %}{{ k }}={{ v }}|{% endeach %}", {
				pairs: [
					["a", 1],
					["b", 2],
				],
			}),
		).toBe("a=1|b=2|");
	});

	it("iterates Map with insertion order", () => {
		const map = new Map<string, number>([
			["x", 10],
			["y", 20],
		]);
		expect(
			renderSrc("{% each m as [k, v] %}{{ k }}:{{ v }} {% endeach %}", {
				m: map,
			}),
		).toBe("x:10 y:20 ");
	});

	it("iterates Set yielding [index, item] pairs", () => {
		const set = new Set(["alpha", "beta"]);
		expect(
			renderSrc("{% each s as [i, v] %}{{ i }}:{{ v }} {% endeach %}", {
				s: set,
			}),
		).toBe("0:alpha 1:beta ");
	});

	it("iterates plain object via Object.entries", () => {
		expect(
			renderSrc("{% each o as [k, v] %}{{ k }}={{ v }};{% endeach %}", {
				o: { name: "Ada", age: 30 },
			}),
		).toBe("name=Ada;age=30;");
	});

	it("rejects destructured binding over null with hint", () => {
		try {
			renderSrc("{% each x as [k, v] %}{% endeach %}", { x: null });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
			expect(err.message).toContain("if x");
		}
	});

	it("rejects Array element that is not a 2-tuple", () => {
		try {
			renderSrc("{% each pairs as [k, v] %}{% endeach %}", {
				pairs: [["only-one"]],
			});
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
			expect(err.message).toContain("2-tuple");
		}
	});

	it("single-binding still rejects Map (D8 preserved)", () => {
		try {
			renderSrc("{% each m as item %}{% endeach %}", {
				m: new Map([["a", 1]]),
			});
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
			expect(err.message).toContain("Array");
		}
	});

	it("destructured empty iterable hits else branch", () => {
		expect(
			renderSrc("{% each o as [k, v] %}{{k}}{% else %}empty{% endeach %}", {
				o: {},
			}),
		).toBe("empty");
	});
});

describe("evalExpression — Call arm return-value contract (D2)", () => {
	it("rejects Promise-returning helper with E_INKER_HELPER_THROW", () => {
		const asyncHelper: HelperFn = () => bypassTypeCheck(Promise.resolve("x"));
		const helpers = new Map<string, HelperFn>([["asyncT", asyncHelper]]);
		try {
			renderSrc("{{ asyncT() }}", {}, helpers);
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_HELPER_THROW");
			expect(err.message).toContain("Promise");
		}
	});

	it("rejects non-string non-SafeString return (number) with E_INKER_HELPER_THROW", () => {
		const numberHelper: HelperFn = () => bypassTypeCheck(42);
		const helpers = new Map<string, HelperFn>([["count", numberHelper]]);
		try {
			renderSrc("{{ count() }}", {}, helpers);
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_HELPER_THROW");
			expect(err.message).toContain("number");
		}
	});

	it("preserves InkerRenderError raised inside helper (no re-wrap)", () => {
		const inner = new InkerRenderError(
			"E_INKER_PARSE_ERROR",
			"inner parse boom",
			{},
		);
		const helpers = new Map<string, HelperFn>([
			[
				"compose",
				() => {
					throw inner;
				},
			],
		]);
		try {
			renderSrc("{{ compose() }}", {}, helpers);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBe(inner);
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_PARSE_ERROR");
		}
	});

	it("accepts null / undefined helper return (renders empty)", () => {
		const nullHelper: HelperFn = () => bypassTypeCheck(null);
		const undefHelper: HelperFn = () => bypassTypeCheck(undefined);
		const helpers = new Map<string, HelperFn>([
			["maybe", nullHelper],
			["nope", undefHelper],
		]);
		expect(renderSrc("{{ maybe() }}{{ nope() }}", {}, helpers)).toBe("");
	});
});

describe("compareBinary — relational guards (P11)", () => {
	it("rejects Symbol operand with E_INKER_INVALID_EXPRESSION", () => {
		try {
			renderSrc("{% if x < y %}t{% endif %}", { x: Symbol("a"), y: 1 });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toContain("relational");
		}
	});

	it("rejects mixed number + string with typed error", () => {
		try {
			renderSrc("{% if a > b %}t{% endif %}", { a: 1, b: "x" });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toContain("number");
			expect(err.message).toContain("string");
		}
	});

	it("accepts homogeneous bigint comparison", () => {
		expect(renderSrc("{{ a < b }}", { a: 1n, b: 2n })).toBe("true");
	});
});

describe("safeStringify — strict object policy (P23)", () => {
	it("renders number / boolean / bigint via String()", () => {
		expect(renderSrc("{{ count }}", { count: 42 })).toBe("42");
		expect(renderSrc("{{ flag }}", { flag: true })).toBe("true");
		expect(renderSrc("{{ big }}", { big: 9007199254740993n })).toBe(
			"9007199254740993",
		);
	});

	it("rejects plain object with E_INKER_INVALID_EXPRESSION", () => {
		try {
			renderSrc("{{ user }}", { user: { name: "Ada" } });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toContain("user");
			expect(err.message).toContain("specific field path");
		}
	});

	it("rejects Symbol with typed error and helper hint", () => {
		try {
			renderSrc("{{ tag }}", { tag: Symbol("alpha") });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
			expect(err.message).toContain("Symbol");
		}
	});

	it("rejects Date as object (no implicit toString — register a helper)", () => {
		try {
			renderSrc("{{ d }}", { d: new Date(0) });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_EXPRESSION");
		}
	});
});

describe("Each renderer — non-plain-object rejection (P9)", () => {
	it("rejects Promise as destructured iterable with E_INKER_INVALID_ITERABLE", () => {
		try {
			renderSrc("{% each p as [k, v] %}{% endeach %}", {
				p: Promise.resolve({}),
			});
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
			expect(err.message).toContain("Promise");
		}
	});

	it("rejects Date as destructured iterable", () => {
		try {
			renderSrc("{% each d as [k, v] %}{% endeach %}", { d: new Date(0) });
			expect.fail("should have thrown");
		} catch (e) {
			const err = asTyped<InkerRenderError>(e);
			expect(err.code).toBe("E_INKER_INVALID_ITERABLE");
			expect(err.message).toContain("Date");
		}
	});

	it("accepts null-prototype plain object", () => {
		const o = bypassTypeCheck<Record<string, unknown>>(Object.create(null));
		o.a = 1;
		o.b = 2;
		expect(
			renderSrc("{% each o as [k, v] %}{{k}}={{v}};{% endeach %}", { o }),
		).toBe("a=1;b=2;");
	});
});

describe("evalExpression — Object arm uses null-prototype (P4)", () => {
	it("object literal does NOT inherit Object.prototype methods", () => {
		const helpers = new Map<string, HelperFn>([
			[
				"hasToString",
				(arg) => {
					const obj = asTyped<Record<string, unknown>>(arg);
					return String("toString" in obj);
				},
			],
		]);
		expect(renderSrc("{{ hasToString({ x: 1 }) }}", {}, helpers)).toBe("false");
	});
});
