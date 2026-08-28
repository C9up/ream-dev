import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissable, layerCount } from "../../src/primitives/dismissable.js";

function surface(id: string): HTMLElement {
	const element = document.createElement("div");
	element.id = id;
	document.body.appendChild(element);
	return element;
}

afterEach(() => {
	document.body.innerHTML = "";
});

function pressEscape(): void {
	document.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
}

function pointerDownOn(target: EventTarget): void {
	target.dispatchEvent(
		new MouseEvent("pointerdown", { bubbles: true, composed: true }),
	);
}

describe("dismissable layers", () => {
	it("registers and removes cleanly", () => {
		const layer = dismissable({ element: () => null, onDismiss: () => {} });
		expect(layerCount()).toBe(1);
		layer.remove();
		expect(layerCount()).toBe(0);
		// Removing twice must not corrupt the stack for anything opened after.
		layer.remove();
		expect(layerCount()).toBe(0);
	});

	it("sends Escape to the topmost layer only", () => {
		const outer = vi.fn();
		const inner = vi.fn();
		const first = dismissable({
			element: () => surface("a"),
			onDismiss: outer,
		});
		const second = dismissable({
			element: () => surface("b"),
			onDismiss: inner,
		});

		pressEscape();
		expect(inner).toHaveBeenCalledTimes(1);
		expect(outer).not.toHaveBeenCalled();

		second.remove();
		pressEscape();
		expect(outer).toHaveBeenCalledTimes(1);
		first.remove();
	});

	it("skips a layer that opted out of Escape and reaches the one below", () => {
		const menu = vi.fn();
		const tip = vi.fn();
		const below = dismissable({
			element: () => surface("menu"),
			onDismiss: menu,
		});
		const above = dismissable({
			element: () => surface("tip"),
			onDismiss: tip,
			escapeKey: false,
		});

		pressEscape();
		expect(tip).not.toHaveBeenCalled();
		expect(menu).toHaveBeenCalledTimes(1);
		above.remove();
		below.remove();
	});

	it("closes layers above the one the pointer landed in, and no further", () => {
		const parentEl = surface("parent");
		const childEl = surface("child");
		const parent = vi.fn();
		const child = vi.fn();

		const first = dismissable({ element: () => parentEl, onDismiss: parent });
		const second = dismissable({ element: () => childEl, onDismiss: child });

		// A click inside the parent menu closes the submenu stacked over it, and
		// leaves the parent open — the behaviour that makes nested menus usable.
		pointerDownOn(parentEl);
		expect(child).toHaveBeenCalledTimes(1);
		expect(parent).not.toHaveBeenCalled();

		second.remove();
		first.remove();
	});

	it("closes everything on a click outside all layers", () => {
		const parent = vi.fn();
		const child = vi.fn();
		const first = dismissable({
			element: () => surface("p"),
			onDismiss: parent,
		});
		const second = dismissable({
			element: () => surface("c"),
			onDismiss: child,
		});

		pointerDownOn(document.body);
		expect(child).toHaveBeenCalledTimes(1);
		expect(parent).toHaveBeenCalledTimes(1);

		second.remove();
		first.remove();
	});

	it("treats an excluded element as inside", () => {
		const trigger = surface("trigger");
		const panel = surface("panel");
		const onDismiss = vi.fn();

		const layer = dismissable({
			element: () => panel,
			exclude: () => [trigger],
			onDismiss,
		});

		// Without the exclusion the trigger's own pointerdown would dismiss, and
		// its click would immediately reopen — the classic "won't close" bug.
		pointerDownOn(trigger);
		expect(onDismiss).not.toHaveBeenCalled();
		layer.remove();
	});

	it("ignores focus moving outside unless the layer asked", () => {
		const panel = surface("panel");
		const outside = surface("outside");
		const ignored = vi.fn();
		const watching = vi.fn();

		const first = dismissable({ element: () => panel, onDismiss: ignored });
		outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(ignored).not.toHaveBeenCalled();
		first.remove();

		const second = dismissable({
			element: () => panel,
			onDismiss: watching,
			outsideFocus: true,
		});
		outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(watching).toHaveBeenCalledTimes(1);
		second.remove();
	});
});
