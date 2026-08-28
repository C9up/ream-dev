/// <reference lib="dom" />
/**
 * Focus trap — keyboard focus cannot leave a subtree while it is active.
 *
 * Required by every modal surface (Dialog, AlertDialog, Sheet, Drawer). The
 * WAI-ARIA dialog pattern is specific about it: Tab from the last focusable
 * element wraps to the first, Shift+Tab from the first wraps to the last, and
 * focus returns to whatever opened the dialog when it closes.
 *
 * Two mechanisms, deliberately both:
 *
 * - A `keydown` handler implements the wrap. This is the path that runs for
 *   ordinary keyboard use, and it is the only one that can put focus on the
 *   *correct* end of the trap.
 * - A `focusin` handler on the document catches everything else — a click on
 *   the page behind, a screen reader jumping by landmark, a browser find bar
 *   handing focus back somewhere else. It pulls focus back into the trap.
 *
 * The keydown handler alone leaks; the focusin handler alone produces the
 * classic bug where Tab escapes and is yanked back a frame later, which reads
 * as a flicker and confuses assistive technology.
 */

import { firstFocusable, focusableWithin, focusSilently } from "./focusable.js";

export interface FocusTrapOptions {
	/**
	 * Where focus goes when the trap activates. Defaults to the first focusable
	 * descendant, then the container itself.
	 */
	initialFocus?: () => HTMLElement | null;
	/**
	 * Where focus goes when it releases. Defaults to whatever was focused when
	 * the trap activated — which is nearly always the trigger.
	 */
	returnFocus?: () => HTMLElement | null;
	/** Skip moving focus on activation. For surfaces that focus themselves. */
	skipInitialFocus?: boolean;
}

export interface FocusTrap {
	/** Tear the trap down and restore focus. Safe to call twice. */
	release(): void;
}

/**
 * Trap focus inside `container` until the returned handle is released.
 *
 * The container is made focusable with `tabindex="-1"` if it is not already,
 * so an empty surface still has somewhere to put focus. Without it, focus
 * would fall to `<body>` and the next Tab would land outside the trap.
 */
export function focusTrap(
	container: HTMLElement,
	options: FocusTrapOptions = {},
): FocusTrap {
	const previouslyFocused = activeElement();

	if (!container.hasAttribute("tabindex")) {
		container.setAttribute("tabindex", "-1");
	}

	if (!options.skipInitialFocus) {
		const target =
			options.initialFocus?.() ?? firstFocusable(container) ?? container;
		focusSilently(target);
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== "Tab") return;

		const focusables = focusableWithin(container);
		if (focusables.length === 0) {
			// Nothing to cycle through: hold focus on the container so Tab cannot
			// walk out into the page behind.
			event.preventDefault();
			focusSilently(container);
			return;
		}

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const current = activeElement();

		if (event.shiftKey && (current === first || current === container)) {
			event.preventDefault();
			focusSilently(last);
		} else if (!event.shiftKey && current === last) {
			event.preventDefault();
			focusSilently(first);
		}
	}

	/**
	 * Pull focus back when it lands outside by any route other than Tab.
	 *
	 * Guarded on `contains`, and only ever moves focus *into* the trap, so it
	 * cannot fight a nested trap: an inner dialog's container is a descendant
	 * of the outer one, so the outer handler sees the focus as already inside.
	 */
	function onFocusIn(event: FocusEvent): void {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (container.contains(target)) return;
		focusSilently(firstFocusable(container) ?? container);
	}

	document.addEventListener("keydown", onKeyDown, true);
	document.addEventListener("focusin", onFocusIn, true);

	let released = false;
	return {
		release(): void {
			if (released) return;
			released = true;
			document.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("focusin", onFocusIn, true);

			const target = options.returnFocus?.() ?? previouslyFocused;
			// Only restore focus if it is still inside the trap. If something else
			// has already claimed it — a second dialog, a toast action — stealing it
			// back would be the wrong call.
			if (container.contains(activeElement())) focusSilently(target);
		},
	};
}

/** The focused element, narrowed to something we can call `.focus()` on. */
function activeElement(): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement ? active : null;
}
