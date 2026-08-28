/// <reference lib="dom" />
/**
 * Roving focus — arrow-key navigation over a group of items.
 *
 * The WAI-ARIA composite-widget pattern: a menu, listbox, tab list or toolbar
 * is *one* tab stop, and arrows move within it. Exactly one item carries
 * `tabindex="0"` at a time; the rest are `-1`. That is what stops a 40-item
 * menu from swallowing 40 presses of Tab.
 *
 * Used by DropdownMenu, ContextMenu, Menubar, Select, Combobox, Command, Tabs
 * and ToggleGroup. The differences between them are configuration, not
 * behaviour: orientation, whether the ends wrap, and whether moving focus also
 * selects.
 *
 * Items are found by querying the container on each keypress rather than being
 * registered up front. Menu contents are reactive — filtered by a Command
 * input, grown by a loaded page — and a registry captured at mount goes stale
 * the moment they change. The query costs a few microseconds per keypress,
 * which is not a budget worth optimising against correctness.
 */

import { focusSilently, isVisible } from "./focusable.js";

export type Orientation = "vertical" | "horizontal" | "both";

export interface RovingFocusOptions {
	/** The group element. Read lazily — it mounts after the group registers. */
	container: () => HTMLElement | null;
	/** Which descendants are navigable. Default: nebula's own item marker. */
	itemSelector?: string;
	/** Which arrows move focus. Default `"vertical"`. */
	orientation?: Orientation;
	/** Wrap from last to first and back. Default `true`. */
	loop?: boolean;
	/** Enter / Space on the focused item. */
	onSelect?: (item: HTMLElement, event: KeyboardEvent) => void;
	/** Focus moved to a new item — used by menus that highlight on navigate. */
	onFocusChange?: (item: HTMLElement) => void;
}

export interface RovingFocus {
	/** Focus the first enabled item. */
	focusFirst(): void;
	/** Focus the last enabled item. */
	focusLast(): void;
	/** The navigable items, in document order. */
	items(): HTMLElement[];
	/** Re-apply `tabindex` after the item list changes. */
	sync(): void;
	/** Detach the key handler. Safe to call twice. */
	destroy(): void;
}

const DEFAULT_ITEM_SELECTOR = "[data-nebula-item]";

export function rovingFocus(options: RovingFocusOptions): RovingFocus {
	const selector = options.itemSelector ?? DEFAULT_ITEM_SELECTOR;
	const orientation = options.orientation ?? "vertical";
	const loop = options.loop !== false;

	function items(): HTMLElement[] {
		const container = options.container();
		if (container === null) return [];

		const found: HTMLElement[] = [];
		for (const node of container.querySelectorAll(selector)) {
			if (!(node instanceof HTMLElement)) continue;
			// Disabled items stay in the DOM for layout and screen-reader context
			// but must not be landed on — matching how a disabled menu item behaves
			// everywhere else.
			if (node.hasAttribute("data-disabled")) continue;
			if (node.getAttribute("aria-disabled") === "true") continue;
			if (!isVisible(node)) continue;
			found.push(node);
		}
		return found;
	}

	/**
	 * One item at `tabindex="0"`, everything else at `-1`.
	 *
	 * The active one is whichever currently holds focus, falling back to the
	 * first. The fallback is what makes the group re-enterable by Tab after
	 * focus has left it.
	 */
	function sync(): void {
		const list = items();
		const focused = document.activeElement;
		const activeIndex =
			focused instanceof HTMLElement ? list.indexOf(focused) : -1;
		const active = activeIndex === -1 ? 0 : activeIndex;

		list.forEach((item, index) => {
			item.tabIndex = index === active ? 0 : -1;
		});
	}

	function move(delta: number): void {
		const list = items();
		if (list.length === 0) return;

		const focused = document.activeElement;
		const current = focused instanceof HTMLElement ? list.indexOf(focused) : -1;
		const next = step(current, delta, list.length, loop);
		if (next === null) return;

		const target = list[next];
		if (target === undefined) return;

		for (const item of list) item.tabIndex = -1;
		target.tabIndex = 0;
		focusSilently(target);
		options.onFocusChange?.(target);
	}

	function focusEdge(edge: "first" | "last"): void {
		const list = items();
		const target = edge === "first" ? list[0] : list[list.length - 1];
		if (target === undefined) return;

		for (const item of list) item.tabIndex = -1;
		target.tabIndex = 0;
		focusSilently(target);
		options.onFocusChange?.(target);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const container = options.container();
		if (container === null) return;
		if (event.target instanceof Node && !container.contains(event.target))
			return;
		// A modifier means the user is talking to the browser, not the widget.
		if (event.altKey || event.ctrlKey || event.metaKey) return;

		const direction = directionFor(event.key, orientation);
		if (direction !== 0) {
			event.preventDefault();
			move(direction);
			return;
		}

		if (event.key === "Home") {
			event.preventDefault();
			focusEdge("first");
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			focusEdge("last");
			return;
		}

		if (event.key === "Enter" || event.key === " ") {
			const active = document.activeElement;
			if (!(active instanceof HTMLElement)) return;
			if (!items().includes(active)) return;
			// Space would scroll the page and Enter would submit a surrounding form;
			// inside a composite widget both mean "activate this item".
			event.preventDefault();
			options.onSelect?.(active, event);
		}
	}

	document.addEventListener("keydown", onKeyDown, true);

	let destroyed = false;
	return {
		focusFirst: () => focusEdge("first"),
		focusLast: () => focusEdge("last"),
		items,
		sync,
		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			document.removeEventListener("keydown", onKeyDown, true);
		},
	};
}

/** `-1` for previous, `+1` for next, `0` when the key is not ours. */
function directionFor(key: string, orientation: Orientation): number {
	const vertical = orientation === "vertical" || orientation === "both";
	const horizontal = orientation === "horizontal" || orientation === "both";

	if (vertical && key === "ArrowDown") return 1;
	if (vertical && key === "ArrowUp") return -1;
	if (horizontal && key === "ArrowRight") return 1;
	if (horizontal && key === "ArrowLeft") return -1;
	return 0;
}

/**
 * Next index, or `null` when the move is refused at an unlooped end.
 *
 * `current === -1` means focus is not on an item yet — the first arrow press
 * after opening a menu. It enters at the first item going down and the last
 * going up, which is what makes ArrowUp on a fresh menu land on its bottom
 * entry the way every native menu does.
 */
function step(
	current: number,
	delta: number,
	length: number,
	loop: boolean,
): number | null {
	if (current === -1) return delta > 0 ? 0 : length - 1;

	const next = current + delta;
	if (next >= 0 && next < length) return next;
	if (!loop) return null;
	return next < 0 ? length - 1 : 0;
}
