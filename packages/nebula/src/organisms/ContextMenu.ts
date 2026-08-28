/**
 * ContextMenu — a menu opened by right-clicking a region.
 *
 * Same panel as DropdownMenu; the difference is the anchor. There is no
 * trigger element to position against — the menu belongs at the pointer, which
 * could be anywhere inside the region.
 *
 * So a zero-size element is parked at the click coordinates and used as the
 * anchor. It is a real element on purpose: `autoPosition` measures its rect,
 * and that rect flips and shifts exactly like a button's would, which is what
 * gets a menu opened near the bottom of the window to open upwards instead of
 * off screen.
 *
 * Long-press opens it on touch, where there is no right button. The 500ms
 * threshold matches the platform convention, and any movement cancels it so a
 * scroll gesture does not surface a menu.
 */

import { component, html, onUnmount, signal } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { type MenuEntry, menuPanel, wireMenu } from "./menu.js";

const LONG_PRESS_MS = 500;

export interface ContextMenuProps {
	/** The region that answers to right-click. */
	children?: Slot;
	entries: readonly MenuEntry[];
	onOpenChange?: (open: boolean) => void;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const ContextMenu = component<ContextMenuProps>((props) => {
	const regionId = uid("context-menu-region");
	const anchorId = uid("context-menu-anchor");
	const contentId = uid("context-menu-content");
	const open = signal(false);

	let unwire: (() => void) | null = null;
	let pressTimer: ReturnType<typeof setTimeout> | undefined;

	function setOpen(next: boolean): void {
		open(next);
		props.onOpenChange?.(next);
	}

	function moveAnchorTo(x: number, y: number): void {
		const anchor = document.getElementById(anchorId);
		if (anchor === null) return;
		anchor.style.left = `${x}px`;
		anchor.style.top = `${y}px`;
	}

	function openAt(x: number, y: number): void {
		moveAnchorTo(x, y);
		setOpen(true);
	}

	function onContextMenu(event: MouseEvent): void {
		event.preventDefault();
		openAt(event.clientX, event.clientY);
	}

	function onPointerDown(event: PointerEvent): void {
		if (event.pointerType !== "touch") return;
		cancelPress();
		pressTimer = setTimeout(
			() => openAt(event.clientX, event.clientY),
			LONG_PRESS_MS,
		);
	}

	function cancelPress(): void {
		if (pressTimer !== undefined) clearTimeout(pressTimer);
		pressTimer = undefined;
	}

	onUnmount(cancelPress);

	floatingSurface({
		anchor: () => document.getElementById(anchorId),
		open: () => open(),
		onClose: () => setOpen(false),
		placement: "bottom-start",
		offset: 2,
		content: () =>
			menuPanel({
				id: contentId,
				entries: props.entries,
				onCloseAll: () => setOpen(false),
				class: read(props.contentClass),
			}),
		onOpened: (panel) => {
			unwire = wireMenu(panel, { onCloseAll: () => setOpen(false) });
			panel.focus({ preventScroll: true });
		},
		onClosed: () => {
			unwire?.();
			unwire = null;
		},
	});

	return html`<div
		data-slot="context-menu"
		id="${regionId}"
		class="${() => cn(read(props.class))}"
		@contextmenu="${onContextMenu}"
		@pointerdown="${onPointerDown}"
		@pointerup="${cancelPress}"
		@pointermove="${cancelPress}"
		@pointercancel="${cancelPress}"
	>
		${slot(props.children)}
		<span
			id="${anchorId}"
			aria-hidden="true"
			class="pointer-events-none fixed size-0"
		></span>
	</div>`;
});
