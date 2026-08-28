import { describe, expect, it } from "vitest";
import {
	addDays,
	addMonths,
	isSameDay,
	monthGrid,
	startOfDay,
} from "../../src/organisms/Calendar.js";

describe("calendar date maths", () => {
	it("normalises to local midnight", () => {
		const noon = new Date(2026, 2, 14, 13, 45, 30, 500);
		const day = startOfDay(noon);
		expect([day.getHours(), day.getMinutes(), day.getSeconds()]).toEqual([
			0, 0, 0,
		]);
		expect(day.getDate()).toBe(14);
	});

	it("rolls over month and year boundaries when adding days", () => {
		expect(addDays(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
		const newYear = addDays(new Date(2026, 11, 31), 1);
		expect([
			newYear.getFullYear(),
			newYear.getMonth(),
			newYear.getDate(),
		]).toEqual([2027, 0, 1]);
	});

	it("handles a leap day", () => {
		const leap = addDays(new Date(2028, 1, 28), 1);
		expect(leap.getDate()).toBe(29);
		expect(leap.getMonth()).toBe(1);
	});

	it("clamps the day when a month is shorter", () => {
		// 31 January plus one month is 28 February, not 3 March.
		const shorter = addMonths(new Date(2026, 0, 31), 1);
		expect([shorter.getMonth(), shorter.getDate()]).toEqual([1, 28]);
	});

	it("keeps the day when the target month is long enough", () => {
		expect(addMonths(new Date(2026, 0, 15), 1).getDate()).toBe(15);
	});

	it("always builds a six-week grid", () => {
		// A grid that changes height between months makes the popover jump.
		for (let month = 0; month < 12; month += 1) {
			expect(monthGrid(new Date(2026, month, 1), 1)).toHaveLength(42);
		}
	});

	it("starts the grid on the configured first day of the week", () => {
		const mondayFirst = monthGrid(new Date(2026, 2, 1), 1);
		const sundayFirst = monthGrid(new Date(2026, 2, 1), 0);
		expect(mondayFirst[0]?.getDay()).toBe(1);
		expect(sundayFirst[0]?.getDay()).toBe(0);
	});

	it("covers every day of the month it was asked for", () => {
		const grid = monthGrid(new Date(2026, 1, 1), 1);
		const inFebruary = grid.filter((date) => date.getMonth() === 1);
		expect(inFebruary).toHaveLength(28);
	});

	it("compares days without regard to time", () => {
		expect(
			isSameDay(new Date(2026, 5, 1, 0, 1), new Date(2026, 5, 1, 23, 59)),
		).toBe(true);
		expect(isSameDay(new Date(2026, 5, 1), new Date(2026, 5, 2))).toBe(false);
		expect(isSameDay(new Date(2026, 5, 1), new Date(2025, 5, 1))).toBe(false);
	});
});
