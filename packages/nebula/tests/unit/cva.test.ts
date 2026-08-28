import { describe, expect, it } from "vitest";
import { cva } from "../../src/lib/cva.js";

describe("cva", () => {
	const button = cva("inline-flex px-3", {
		variants: {
			variant: { default: "bg-primary", ghost: "hover:bg-accent" },
			size: { sm: "h-8 px-2", lg: "h-10 px-8" },
			disabled: { true: "opacity-50", false: "" },
		},
		compoundVariants: [{ variant: "ghost", size: "sm", class: "border-0" }],
		defaultVariants: { variant: "default", size: "lg" },
	});

	it("applies the default variants when nothing is selected", () => {
		const result = button();
		expect(result).toContain("bg-primary");
		expect(result).toContain("h-10");
	});

	it("resolves tailwind conflicts, keeping the variant over the base", () => {
		// Base sets px-3, the `sm` size sets px-2. Upstream cva emits both and
		// leaves the winner to source order; running through `cn` decides it.
		const result = button({ size: "sm" });
		expect(result).toContain("px-2");
		expect(result).not.toContain("px-3");
	});

	it("lets the caller's class win over everything", () => {
		expect(button({ size: "lg", class: "px-1" })).toContain("px-1");
		expect(button({ size: "lg", class: "px-1" })).not.toContain("px-8");
	});

	it("maps a real boolean onto a string-keyed axis", () => {
		expect(button({ disabled: true })).toContain("opacity-50");
		expect(button({ disabled: false })).not.toContain("opacity-50");
	});

	it("applies a compound rule only when every condition holds", () => {
		expect(button({ variant: "ghost", size: "sm" })).toContain("border-0");
		expect(button({ variant: "ghost", size: "lg" })).not.toContain("border-0");
		expect(button({ variant: "default", size: "sm" })).not.toContain(
			"border-0",
		);
	});

	it("treats an explicit null as opting out of a default", () => {
		const result = button({ variant: null });
		expect(result).not.toContain("bg-primary");
		expect(result).toContain("h-10");
	});

	it("accepts several values for one axis in a compound rule", () => {
		const badge = cva("base", {
			variants: { tone: { warn: "w", error: "e", info: "i" } },
			compoundVariants: [{ tone: ["warn", "error"], class: "loud" }],
		});
		expect(badge({ tone: "warn" })).toContain("loud");
		expect(badge({ tone: "error" })).toContain("loud");
		expect(badge({ tone: "info" })).not.toContain("loud");
	});
});
