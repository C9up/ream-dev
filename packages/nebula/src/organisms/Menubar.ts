/**
 * Menubar — an application menu bar.
 *
 * A row of menu buttons where at most one menu is open. The behaviour that
 * makes it a menubar rather than a row of independent dropdowns is the
 * handover: once a menu is open, moving the pointer onto a neighbouring button
 * switches to it without a click, and ArrowLeft/ArrowRight do the same from
 * the keyboard. That is how every desktop menu bar behaves, and a row of
 * dropdowns that each need their own click is the thing users notice.
 *
 * One `floatingSurface` for the bar, not one per menu. The open menu is an
 * index, so switching moves the same surface to a new anchor instead of
 * closing one and opening another — which would flash, and would lose the
 * exit animation into the entry animation.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { type MenuEntry, menuPanel, wireMenu } from "./menu.js";

export interface MenubarMenu {
	label: Child;
	entries: readonly MenuEntry[];
	disabled?: boolean;
}

export interface MenubarProps {
	menus: readonly MenubarMenu[];
	class?: Reactive<string>;
}

export const Menubar = component<MenubarProps>((props) => {
	const contentId = uid("menubar-content");
	const triggerIds = props.menus.map(() => uid("menubar-trigger"));
	/** Index of the open menu, or `-1`. */
	const openIndex = signal(-1);

	let unwire: (() => void) | null = null;
	let focusFirstOnOpen = false;

	function close(): void {
		openIndex(-1);
	}

	function openAt(index: number, withKeyboard: boolean): void {
		if (props.menus[index]?.disabled === true) return;
		focusFirstOnOpen = withKeyboard;
		openIndex(index);
	}

	function move(delta: number): void {
		const count = props.menus.length;
		if (count === 0) return;
		const from = openIndex();
		if (from === -1) return;
		openAt((from + delta + count) % count, true);
	}

	floatingSurface({
		anchor: () => {
			const id = triggerIds[openIndex()];
			return id === undefined ? null : document.getElementById(id);
		},
		open: () => openIndex() !== -1,
		onClose: close,
		placement: "bottom-start",
		offset: 4,
		content: () =>
			menuPanel({
				id: contentId,
				entries: props.menus[openIndex()]?.entries ?? [],
				onCloseAll: close,
				labelledBy: triggerIds[openIndex()],
			}),
		onOpened: (panel) => {
			unwire = wireMenu(panel, {
				onCloseAll: close,
				autoFocusFirst: focusFirstOnOpen,
			});
			focusFirstOnOpen = false;
			panel.focus({ preventScroll: true });
			// Left/right walk the bar from inside the open panel. `menu.js` claims
			// ArrowLeft for closing a submenu and stops propagation when it does,
			// so this only fires at the top level.
			panel.addEventListener("keydown", onPanelKeyDown);
		},
		onClosed: () => {
			unwire?.();
			unwire = null;
		},
	});

	function onPanelKeyDown(event: KeyboardEvent): void {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			move(-1);
		}
	}

	return html`<div
		data-slot="menubar"
		role="menubar"
		class="${() =>
			cn(
				"bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
				read(props.class),
			)}"
	>
		${props.menus.map((menu, index) => renderTrigger(menu, index))}
	</div>`;

	function renderTrigger(menu: MenubarMenu, index: number): Child {
		return html`<button
			type="button"
			role="menuitem"
			data-slot="menubar-trigger"
			id="${triggerIds[index]}"
			aria-haspopup="menu"
			aria-expanded="${() => (openIndex() === index ? "true" : "false")}"
			aria-controls="${() => (openIndex() === index ? contentId : undefined)}"
			data-state="${() => (openIndex() === index ? "open" : "closed")}"
			?disabled="${menu.disabled === true}"
			class="focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex select-none items-center rounded-sm px-2 py-1 text-sm font-medium outline-none disabled:pointer-events-none disabled:opacity-50"
			@click="${() => (openIndex() === index ? close() : openAt(index, false))}"
			@pointerenter="${() => {
				// Hover switches menus only while one is already open — otherwise
				// the bar would spring menus at a pointer merely passing over it.
				if (openIndex() !== -1) openAt(index, false);
			}}"
			@keydown="${(event: KeyboardEvent) => {
				if (
					event.key === "ArrowDown" ||
					event.key === "Enter" ||
					event.key === " "
				) {
					event.preventDefault();
					openAt(index, true);
				} else if (event.key === "ArrowRight") {
					event.preventDefault();
					focusTrigger(index + 1);
				} else if (event.key === "ArrowLeft") {
					event.preventDefault();
					focusTrigger(index - 1);
				}
			}}"
		>${menu.label}</button>`;
	}

	function focusTrigger(index: number): void {
		const count = props.menus.length;
		if (count === 0) return;
		const id = triggerIds[(index + count) % count];
		if (id === undefined) return;
		document.getElementById(id)?.focus({ preventScroll: true });
	}
});
