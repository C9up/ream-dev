/// <reference lib="dom" />
/**
 * Floating surface — the whole lifecycle of a popover-shaped overlay.
 *
 * Popover, Tooltip, HoverCard, DropdownMenu, ContextMenu, Menubar, Select and
 * Combobox are the same machine with different contents and different opening
 * gestures. That machine is: portal out of the tree, position against an
 * anchor, register as a dismissable layer, optionally trap focus, and on close
 * let the exit animation finish before removing anything.
 *
 * Five primitives in a fixed order, and the order is the part that is easy to
 * get wrong. The layer must register *after* the content exists, or its
 * containment check has nothing to test against and the opening click closes
 * it again. The focus trap must run after the first position pass, or it
 * focuses a surface still sitting at (0,0) and the browser scrolls to it.
 *
 * Written once here so eight components cannot each get that order slightly
 * different.
 */

import { effect, onMount, type TemplateResult } from "@c9up/aurora";
import {
	type DismissableLayer,
	type DismissReason,
	dismissable,
} from "./dismissable.js";
import { type AutoPosition, autoPosition, type Placement } from "./floating.js";
import { firstFocusable, focusSilently } from "./focusable.js";
import { type FocusTrap, focusTrap } from "./focusTrap.js";
import { type Portal, portal } from "./portal.js";
import { onExitFinished } from "./presence.js";

export interface FloatingSurfaceOptions {
	/** What the surface is positioned against — usually the trigger. */
	anchor: () => HTMLElement | null;
	/** Should the surface be showing? Read reactively. */
	open: () => boolean;
	/** The surface wants to close. Flip whatever drives `open`. */
	onClose: (reason: DismissReason) => void;
	/** The surface's markup. Built fresh on each open. */
	content: () => TemplateResult;

	placement?: Placement;
	offset?: number;
	/** Size the surface to the anchor. Select and Combobox want this. */
	matchWidth?: boolean;

	/** Keep keyboard focus inside while open. */
	trapFocus?: boolean;
	/** Move focus into the surface on open. Implied by `trapFocus`. */
	autoFocus?: boolean;
	/** Where focus goes first. Defaults to the first focusable element. */
	initialFocus?: (content: HTMLElement) => HTMLElement | null;

	escapeKey?: boolean;
	outsidePointer?: boolean;
	/** Default `false` — a surface that opened on hover should not steal focus. */
	outsideFocus?: boolean;

	/** The surface is live and positioned. Wire item handlers here. */
	onOpened?: (content: HTMLElement) => void;
	/** The surface is about to be removed. */
	onClosed?: () => void;
}

interface Live {
	readonly mount: Portal;
	readonly element: HTMLElement;
	readonly position: AutoPosition;
	readonly layer: DismissableLayer;
	readonly trap: FocusTrap | null;
	cancelExit: (() => void) | null;
}

/**
 * Wire a floating surface into the surrounding component.
 *
 * Call from a component setup. It registers its own mount and unmount hooks,
 * so there is nothing to dispose by hand.
 */
export function floatingSurface(options: FloatingSurfaceOptions): void {
	let live: Live | null = null;

	function show(): void {
		if (live !== null) {
			// Already open and mid-exit: cancel the teardown and reuse the node
			// rather than stacking a second copy on top of the one fading out.
			live.cancelExit?.();
			live.cancelExit = null;
			live.element.setAttribute("data-state", "open");
			return;
		}

		const anchor = options.anchor();
		if (anchor === null) return;

		const mount = portal(options.content());
		const element = mount.host.firstElementChild;
		if (!(element instanceof HTMLElement)) {
			mount.close();
			return;
		}

		element.setAttribute("data-state", "open");

		const position = autoPosition(anchor, element, {
			placement: options.placement,
			offset: options.offset,
			matchWidth: options.matchWidth,
		});

		const layer = dismissable({
			element: () => element,
			exclude: () => [anchor],
			onDismiss: options.onClose,
			escapeKey: options.escapeKey,
			outsidePointer: options.outsidePointer,
			outsideFocus: options.outsideFocus ?? false,
		});

		let trap: FocusTrap | null = null;
		if (options.trapFocus === true) {
			trap = focusTrap(element, {
				initialFocus: () => options.initialFocus?.(element) ?? null,
			});
		} else if (options.autoFocus === true) {
			focusSilently(options.initialFocus?.(element) ?? firstFocusable(element));
		}

		live = { mount, element, position, layer, trap, cancelExit: null };
		options.onOpened?.(element);
	}

	function hide(): void {
		const current = live;
		if (current === null) return;

		// Detach behaviour first, then animate out. A surface that is fading
		// should not still be answering Escape or repositioning itself.
		current.layer.remove();
		current.position.stop();
		current.trap?.release();
		current.element.setAttribute("data-state", "closed");
		options.onClosed?.();

		current.cancelExit = onExitFinished(current.element, () => {
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
		current.position.stop();
		current.trap?.release();
		current.mount.close();
	}

	onMount(() => {
		const stop = effect(() => {
			if (options.open()) show();
			else hide();
		});
		// The component is going away, so the exit animation has nobody left to
		// play for — drop the node immediately rather than orphaning it in body.
		return () => {
			stop();
			teardown();
		};
	});
}
