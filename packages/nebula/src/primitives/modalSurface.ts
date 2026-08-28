/// <reference lib="dom" />
/**
 * Modal surface — the lifecycle of a dialog-shaped overlay.
 *
 * Dialog, AlertDialog, Sheet and Drawer differ only in where they come from
 * and how they animate. What they share is the modal contract, and every part
 * of it is a thing an app gets wrong when it builds one by hand:
 *
 * - A backdrop, so the page behind reads as unavailable.
 * - Focus trapped inside, and returned to the trigger on close.
 * - Page scroll locked, without the sideways jump when the scrollbar goes.
 * - Escape closes; a click on the backdrop closes, unless the surface is
 *   asking a question that must be answered (AlertDialog).
 * - The rest of the page hidden from assistive technology, so a screen reader
 *   cannot wander out of the dialog while sighted users cannot.
 *
 * That last one is the one almost always missed. Trapping *keyboard* focus
 * does nothing for a reader navigating by heading or landmark — it will read
 * straight through the page behind the overlay. `aria-hidden` on the siblings
 * of the portal is what actually makes the dialog modal.
 */

import { effect, onMount, type TemplateResult } from "@c9up/aurora";
import {
	type DismissableLayer,
	type DismissReason,
	dismissable,
} from "./dismissable.js";
import { type FocusTrap, focusTrap } from "./focusTrap.js";
import { type Portal, portal } from "./portal.js";
import { onExitFinished } from "./presence.js";
import { lockScroll } from "./scrollLock.js";

export interface ModalSurfaceOptions {
	open: () => boolean;
	onClose: (reason: DismissReason) => void;
	/** The whole overlay: backdrop and panel. */
	content: () => TemplateResult;
	/**
	 * The panel within the content, when the content's root is a full-screen
	 * wrapper.
	 *
	 * Containment is answered against this, not the root. An overlay's root
	 * usually spans the viewport so the backdrop can, and a root-based check
	 * would report every click on the page as "inside" — outside-click dismissal
	 * would silently never fire. The focus trap needs the same distinction:
	 * trapping to the root would let Tab reach the backdrop.
	 *
	 * Defaults to the root, which is right for an overlay that is only a panel.
	 */
	panel?: (root: HTMLElement) => HTMLElement | null;
	/** Where focus lands. Defaults to the first focusable element. */
	initialFocus?: (content: HTMLElement) => HTMLElement | null;
	/** Where focus returns. Defaults to whatever was focused before opening. */
	returnFocus?: () => HTMLElement | null;
	/** A click outside closes. `false` for a decision that must be made. */
	dismissOnOutside?: boolean;
	/** Escape closes. `false` for the same reason. */
	dismissOnEscape?: boolean;
	/** Hold page scroll. Default `true`. */
	lockScroll?: boolean;
	onOpened?: (content: HTMLElement) => void;
	onClosed?: () => void;
}

interface Live {
	readonly mount: Portal;
	/** Carries `data-state`; the exit animation is watched here. */
	readonly element: HTMLElement;
	readonly layer: DismissableLayer;
	readonly trap: FocusTrap;
	readonly unlock: () => void;
	readonly restoreSiblings: () => void;
	cancelExit: (() => void) | null;
}

export function modalSurface(options: ModalSurfaceOptions): void {
	let live: Live | null = null;

	function show(): void {
		if (live !== null) {
			live.cancelExit?.();
			live.cancelExit = null;
			live.element.setAttribute("data-state", "open");
			return;
		}

		const mount = portal(options.content());
		const element = mount.host.firstElementChild;
		if (!(element instanceof HTMLElement)) {
			mount.close();
			return;
		}
		element.setAttribute("data-state", "open");

		const panel = options.panel?.(element) ?? element;
		const unlock = options.lockScroll === false ? () => {} : lockScroll();
		const restoreSiblings = hideSiblingsFrom(mount.host);

		const trap = focusTrap(panel, {
			initialFocus: () => options.initialFocus?.(panel) ?? null,
			returnFocus: options.returnFocus,
		});

		const layer = dismissable({
			element: () => panel,
			onDismiss: options.onClose,
			escapeKey: options.dismissOnEscape !== false,
			outsidePointer: options.dismissOnOutside !== false,
			outsideFocus: false,
		});

		live = {
			mount,
			element,
			layer,
			trap,
			unlock,
			restoreSiblings,
			cancelExit: null,
		};
		options.onOpened?.(panel);
	}

	function hide(): void {
		const current = live;
		if (current === null) return;

		current.layer.remove();
		current.trap.release();
		current.restoreSiblings();
		current.element.setAttribute("data-state", "closed");
		options.onClosed?.();

		// Scroll stays locked through the exit animation. Releasing it first
		// lets the page jump back under a panel that is still sliding away.
		current.cancelExit = onExitFinished(current.element, () => {
			current.unlock();
			current.mount.close();
			if (live === current) live = null;
		});
	}

	function teardown(): void {
		const current = live;
		if (current === null) return;
		live = null;
		current.cancelExit?.();
		current.layer.remove();
		current.trap.release();
		current.restoreSiblings();
		current.unlock();
		current.mount.close();
	}

	onMount(() => {
		const stop = effect(() => {
			if (options.open()) show();
			else hide();
		});
		return () => {
			stop();
			teardown();
		};
	});
}

/**
 * Hide everything except the overlay from assistive technology.
 *
 * Marks each sibling of the portal host, and restores exactly what was there
 * before — an element that was *already* `aria-hidden` for its own reasons
 * must stay that way after the dialog closes, so the previous value is saved
 * rather than the attribute simply removed.
 *
 * Only siblings of the host, not the whole page: a second modal opening over
 * the first must not hide it, and it will not, because it appends its own host
 * after the first one and only touches what is beside it.
 */
function hideSiblingsFrom(host: HTMLElement): () => void {
	const parent = host.parentElement;
	if (parent === null) return () => {};

	const saved: Array<[Element, string | null]> = [];
	for (const sibling of parent.children) {
		if (sibling === host) continue;
		// A live region announcing outside the dialog (a toast) is deliberate.
		if (sibling.hasAttribute("data-nebula-live")) continue;
		saved.push([sibling, sibling.getAttribute("aria-hidden")]);
		sibling.setAttribute("aria-hidden", "true");
	}

	return (): void => {
		for (const [element, previous] of saved) {
			if (previous === null) element.removeAttribute("aria-hidden");
			else element.setAttribute("aria-hidden", previous);
		}
	};
}
