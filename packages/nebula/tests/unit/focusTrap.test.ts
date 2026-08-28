import { afterEach, describe, expect, it } from "vitest";
import {
	focusableWithin,
	isFocusable,
} from "../../src/primitives/focusable.js";
import { focusTrap } from "../../src/primitives/focusTrap.js";

function panel(markup: string): HTMLElement {
	const element = document.createElement("div");
	element.innerHTML = markup;
	document.body.appendChild(element);
	return element;
}

function tab(shift = false): void {
	document.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: shift,
			bubbles: true,
		}),
	);
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("focusable", () => {
	it("lists candidates in document order", () => {
		const surface = panel(
			'<button id="a"></button><a href="#" id="b"></a><input id="c" />',
		);
		expect(focusableWithin(surface).map((node) => node.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("rejects disabled and negatively-tabbable elements", () => {
		const surface = panel(
			'<button disabled id="a"></button><div tabindex="-1" id="b"></div>',
		);
		expect(focusableWithin(surface)).toHaveLength(0);
	});

	it("rejects anything inside an inert subtree", () => {
		const surface = panel('<div inert><button id="a"></button></div>');
		expect(focusableWithin(surface)).toHaveLength(0);
	});

	it("rejects an element hidden from assistive technology", () => {
		const surface = panel('<button aria-hidden="true" id="a"></button>');
		const button = surface.querySelector("#a");
		expect(button !== null && isFocusable(button)).toBe(false);
	});
});

describe("focusTrap", () => {
	it("focuses the first focusable element on activation", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("wraps from the last element to the first", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);

		surface.querySelector<HTMLElement>("#b")?.focus();
		tab();
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("wraps backwards from the first element to the last", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);

		surface.querySelector<HTMLElement>("#a")?.focus();
		tab(true);
		expect(document.activeElement?.id).toBe("b");
		trap.release();
	});

	it("holds focus on the container when there is nothing to focus", () => {
		const surface = panel("<p>Nothing interactive here.</p>");
		const trap = focusTrap(surface);
		// Without this the next Tab walks straight out into the page behind.
		tab();
		expect(document.activeElement).toBe(surface);
		trap.release();
	});

	it("pulls focus back when it lands outside by some other route", () => {
		const outside = document.createElement("button");
		document.body.appendChild(outside);
		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);

		outside.focus();
		outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("returns focus to whatever was focused before", () => {
		const trigger = document.createElement("button");
		trigger.id = "trigger";
		document.body.appendChild(trigger);
		trigger.focus();

		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);
		expect(document.activeElement?.id).toBe("a");

		trap.release();
		expect(document.activeElement?.id).toBe("trigger");
	});

	it("leaves focus alone when something else already claimed it", () => {
		const trigger = document.createElement("button");
		trigger.id = "trigger";
		const elsewhere = document.createElement("button");
		elsewhere.id = "elsewhere";
		document.body.append(trigger, elsewhere);
		trigger.focus();

		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);
		trap.release();
		// A toast action or a second dialog took focus; stealing it back would
		// yank the user out of wherever they now are.
		elsewhere.focus();
		trap.release();
		expect(document.activeElement?.id).toBe("elsewhere");
	});
});
