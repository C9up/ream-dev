/**
 * Popover — a floating panel anchored to a trigger.
 *
 * The plainest use of `floatingSurface`, and the one to read first: the other
 * anchored overlays in this directory are this component with a different
 * opening gesture and different contents.
 *
 * `modal` decides whether focus is trapped. A popover holding a form should
 * trap — tabbing out of a half-filled form into the page behind loses the
 * user's place. A popover holding a paragraph of help should not, because
 * trapping focus in something the user can only read is a dead end.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Placement } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

export const popoverContentClasses =
	"bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-none";

export interface PopoverProps {
	/** Rendered inside the trigger button. */
	trigger?: Slot;
	/** The panel's contents. */
	children?: Slot;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	placement?: Placement;
	offset?: number;
	/** Trap focus inside. Use for panels holding form controls. */
	modal?: boolean;
	class?: Reactive<string>;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const Popover = component<PopoverProps>((props) => {
	const triggerId = uid("popover-trigger");
	const contentId = uid("popover-content");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => state.current(),
		onClose: () => state.set(false),
		placement: props.placement ?? "bottom",
		offset: props.offset ?? 4,
		trapFocus: props.modal === true,
		autoFocus: props.modal !== true,
		content: () =>
			html`<div
				data-slot="popover-content"
				id="${contentId}"
				role="dialog"
				aria-labelledby="${triggerId}"
				tabindex="-1"
				class="${cn(popoverContentClasses, zoomInOut, read(props.contentClass))}"
			>${slot(props.children)}</div>`,
	});

	return html`<button
		type="button"
		data-slot="popover-trigger"
		id="${triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (state.current() ? "true" : "false")}"
		aria-controls="${() => (state.current() ? contentId : undefined)}"
		data-state="${() => (state.current() ? "open" : "closed")}"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(!state.current())}"
	>${slot(props.trigger)}</button>`;
});
