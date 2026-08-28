import { describe, expect, it } from "vitest";
import { pageWindow } from "../../src/molecules/Pagination.js";

describe("pageWindow", () => {
	it("lists every page when they all fit", () => {
		expect(pageWindow(1, 5, 7)).toEqual([1, 2, 3, 4, 5]);
	});

	it("keeps a constant number of slots as the page moves", () => {
		// The reason this function exists: a naive window around the current page
		// narrows near the ends and the control visibly reflows while clicking.
		const widths = [1, 2, 5, 10, 49, 50].map(
			(page) => pageWindow(page, 50, 7).length,
		);
		expect(new Set(widths).size).toBe(1);
	});

	it("always shows the first and last page", () => {
		const slots = pageWindow(25, 50, 7);
		expect(slots[0]).toBe(1);
		expect(slots[slots.length - 1]).toBe(50);
	});

	it("marks gaps with null on both sides in the middle", () => {
		const slots = pageWindow(25, 50, 7);
		expect(slots.filter((entry) => entry === null)).toHaveLength(2);
	});

	it("has a single gap near an end", () => {
		expect(pageWindow(2, 50, 7).filter((entry) => entry === null)).toHaveLength(
			1,
		);
		expect(
			pageWindow(49, 50, 7).filter((entry) => entry === null),
		).toHaveLength(1);
	});

	it("includes the current page", () => {
		for (const page of [1, 7, 23, 44, 50]) {
			expect(pageWindow(page, 50, 7)).toContain(page);
		}
	});
});
