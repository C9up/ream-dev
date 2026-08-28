/**
 * Tooltip — a label that appears on hover or focus.
 *
 * Three rules separate a usable tooltip from an irritating one, and all three
 * are about time rather than appearance:
 *
 * - An **open delay**, so moving the pointer across a toolbar does not fire
 *   six tooltips on the way past.
 * - A **close delay**, so travelling from the trigger to the tooltip — which a
 *   user does to read a long one, or click a link inside — does not dismiss it
 *   halfway.
 * - **No delay between neighbours.** Once one tooltip is showing, the next one
 *   appears instantly; the user has clearly decided to browse the toolbar, and
 *   re-serving the delay each time makes the interface feel stuck. That is why
 *   `lastClosedAt` is module state and not per-component.
 *
 * Focus opens it with no delay at all. A keyboard user landing on a control
 * has already committed to it, and a delay just looks like lag.
 *
 * `role="tooltip"` plus `aria-describedby` — never `aria-labelledby`. A
 * tooltip supplements a control's name; it is not the name. A button labelled
 * only by its tooltip is unlabelled to anything that does not hover.
 */

import { component, html, onUnmount, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { fadeInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import type { Placement } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

const OPEN_DELAY_MS = 500;
const CLOSE_DELAY_MS = 150;
/** How long after one closes that the next opens instantly. */
const GRACE_MS = 300;

/** Shared across every tooltip on the page — see the "no delay" rule above. */
let lastClosedAt = 0;

export interface TooltipProps {
	/** The control being described. */
	trigger?: Slot;
	/** The tooltip text. Keep it to a phrase. */
	content?: Child;
	placement?: Placement;
	openDelay?: number;
	closeDelay?: number;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const Tooltip = component<TooltipProps>((props) => {
	const triggerId = uid("tooltip-trigger");
	const contentId = uid("tooltip-content");
	const open = signal(false);

	let timer: ReturnType<typeof setTimeout> | undefined;

	function clear(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function scheduleOpen(immediate: boolean): void {
		clear();
		const withinGrace = Date.now() - lastClosedAt < GRACE_MS;
		const delay =
			immediate || withinGrace ? 0 : (props.openDelay ?? OPEN_DELAY_MS);
		if (delay === 0) {
			open(true);
			return;
		}
		timer = setTimeout(() => open(true), delay);
	}

	function scheduleClose(): void {
		clear();
		timer = setTimeout(() => {
			open(false);
			lastClosedAt = Date.now();
		}, props.closeDelay ?? CLOSE_DELAY_MS);
	}

	onUnmount(clear);

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => {
			clear();
			open(false);
		},
		placement: props.placement ?? "top",
		offset: 6,
		outsidePointer: false,
		content: () =>
			html`<div
				data-slot="tooltip-content"
				id="${contentId}"
				role="tooltip"
				class="${cn(
					"bg-primary text-primary-foreground z-50 w-fit rounded-md px-3 py-1.5 text-xs text-balance",
					fadeInOut,
					read(props.contentClass),
				)}"
				@pointerenter="${clear}"
				@pointerleave="${scheduleClose}"
			>${props.content}</div>`,
	});

	return html`<span
		data-slot="tooltip-trigger"
		id="${triggerId}"
		aria-describedby="${() => (open() ? contentId : undefined)}"
		class="${() => cn("inline-flex", read(props.class))}"
		@pointerenter="${() => scheduleOpen(false)}"
		@pointerleave="${scheduleClose}"
		@focusin="${() => scheduleOpen(true)}"
		@focusout="${scheduleClose}"
	>${slot(props.trigger)}</span>`;
});
