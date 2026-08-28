import { afterEach, describe, expect, it, vi } from "vitest";
import { typeahead } from "../../src/primitives/typeahead.js";

function items(labels: readonly string[]): HTMLElement[] {
	return labels.map((label) => {
		const element = document.createElement("div");
		element.textContent = label;
		document.body.appendChild(element);
		return element;
	});
}

function press(key: string): KeyboardEvent {
	return new KeyboardEvent("keydown", { key });
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("typeahead", () => {
	it("matches on the accumulated buffer, not the last key", () => {
		const list = items(["Stockholm", "Tokyo", "Toronto"]);
		const onMatch = vi.fn();
		const seek = typeahead({ items: () => list, current: () => null, onMatch });

		seek.handleKey(press("s"));
		seek.handleKey(press("t"));
		// "st" must not degrade into "t" and land on Tokyo.
		expect(onMatch).toHaveBeenLastCalledWith(list[0]);
	});

	it("cycles through matches when one letter is repeated", () => {
		const list = items(["Sydney", "Seville", "Stockholm"]);
		const matched: string[] = [];
		let current: HTMLElement | null = null;
		const seek = typeahead({
			items: () => list,
			current: () => current,
			onMatch: (item) => {
				current = item;
				matched.push(item.textContent ?? "");
			},
		});

		seek.handleKey(press("s"));
		seek.handleKey(press("s"));
		seek.handleKey(press("s"));
		expect(matched).toEqual(["Sydney", "Seville", "Stockholm"]);
	});

	it("wraps around at the end of the list", () => {
		const list = items(["Alpha", "Beta"]);
		let current: HTMLElement | null = list[1] ?? null;
		const matched: string[] = [];
		const seek = typeahead({
			items: () => list,
			current: () => current,
			onMatch: (item) => {
				current = item;
				matched.push(item.textContent ?? "");
			},
		});

		seek.handleKey(press("a"));
		expect(matched).toEqual(["Alpha"]);
	});

	it("passes control keys through untouched", () => {
		const list = items(["Alpha"]);
		const onMatch = vi.fn();
		const seek = typeahead({ items: () => list, current: () => null, onMatch });

		expect(seek.handleKey(press("ArrowDown"))).toBe(false);
		expect(seek.handleKey(press("Enter"))).toBe(false);
		expect(onMatch).not.toHaveBeenCalled();
	});

	it("lets space through on an empty buffer but claims it mid-search", () => {
		const list = items(["New York"]);
		const onMatch = vi.fn();
		const seek = typeahead({ items: () => list, current: () => null, onMatch });

		// Space alone means "activate the focused item" and must reach the caller.
		expect(seek.handleKey(press(" "))).toBe(false);

		seek.handleKey(press("n"));
		seek.handleKey(press("e"));
		seek.handleKey(press("w"));
		expect(seek.handleKey(press(" "))).toBe(true);
		seek.handleKey(press("y"));
		expect(onMatch).toHaveBeenLastCalledWith(list[0]);
	});

	it("ignores keys held with a command modifier", () => {
		const list = items(["Find"]);
		const onMatch = vi.fn();
		const seek = typeahead({ items: () => list, current: () => null, onMatch });

		const withCtrl = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
		expect(seek.handleKey(withCtrl)).toBe(false);
		expect(onMatch).not.toHaveBeenCalled();
	});
});
