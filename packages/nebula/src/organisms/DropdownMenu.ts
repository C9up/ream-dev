/**
 * DropdownMenu — a menu opened from a button.
 *
 * The panel, its entries and its keyboard model all come from `./menu.js`;
 * this component contributes the trigger and the open/close state.
 *
 * Two behaviours are specific to a button-opened menu:
 *
 * - Opening with the keyboard focuses the first item; opening with the pointer
 *   does not. A keyboard user has no other way in, while pre-highlighting an
 *   item for a mouse user suggests it is about to be chosen.
 * - ArrowDown on the trigger opens the menu *and* enters it, which is the
 *   behaviour of every native menu button and the one users try first.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Placement } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { type MenuEntry, menuPanel, wireMenu } from "./menu.js";

export interface DropdownMenuProps {
	trigger?: Slot;
	entries: readonly MenuEntry[];
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	placement?: Placement;
	class?: Reactive<string>;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const DropdownMenu = component<DropdownMenuProps>((props) => {
	const triggerId = uid("dropdown-trigger");
	const contentId = uid("dropdown-content");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	// Set by the trigger's key handler just before opening, and consumed by
	// `onOpened`. The panel does not exist yet at the moment of the keypress, so
	// the intent has to survive the gap.
	let enterOnOpen = false;
	let unwire: (() => void) | null = null;

	function close(): void {
		state.set(false);
	}

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => state.current(),
		onClose: close,
		placement: props.placement ?? "bottom-start",
		offset: 4,
		content: () =>
			menuPanel({
				id: contentId,
				entries: props.entries,
				onCloseAll: close,
				labelledBy: triggerId,
				class: read(props.contentClass),
			}),
		onOpened: (panel) => {
			unwire = wireMenu(panel, {
				onCloseAll: close,
				autoFocusFirst: enterOnOpen,
			});
			enterOnOpen = false;
			// The panel itself takes focus even when no item does, so Escape and
			// the arrow keys reach it rather than the page behind.
			panel.focus({ preventScroll: true });
		},
		onClosed: () => {
			unwire?.();
			unwire = null;
		},
	});

	function onTriggerKeyDown(event: KeyboardEvent): void {
		if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ")
			return;
		event.preventDefault();
		enterOnOpen = true;
		state.set(true);
	}

	return html`<button
		type="button"
		data-slot="dropdown-menu-trigger"
		id="${triggerId}"
		aria-haspopup="menu"
		aria-expanded="${() => (state.current() ? "true" : "false")}"
		aria-controls="${() => (state.current() ? contentId : undefined)}"
		data-state="${() => (state.current() ? "open" : "closed")}"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(!state.current())}"
		@keydown="${onTriggerKeyDown}"
	>${slot(props.trigger)}</button>`;
});
