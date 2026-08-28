/**
 * HoverCard — a rich preview shown on hover.
 *
 * A Tooltip carries a phrase; a HoverCard carries content — an avatar, a
 * summary, a link. That difference drives every behavioural difference between
 * the two.
 *
 * It opens more slowly, because the payload is heavier and a card flashing
 * past is worse than a tooltip flashing past. It closes more slowly, because
 * the user is expected to move the pointer *into* it. And it is never the only
 * route to what it contains: pointer-only content is unreachable by keyboard
 * and touch, so a hover card must preview something a click already reaches.
 *
 * `role="dialog"` rather than `tooltip`, since it holds interactive content —
 * a tooltip's contents are announced as a description, which is wrong for
 * something containing a link.
 */

import { component, html, onUnmount, signal } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import type { Placement } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

const OPEN_DELAY_MS = 700;
const CLOSE_DELAY_MS = 300;

export interface HoverCardProps {
	trigger?: Slot;
	children?: Slot;
	placement?: Placement;
	openDelay?: number;
	closeDelay?: number;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const HoverCard = component<HoverCardProps>((props) => {
	const triggerId = uid("hover-card-trigger");
	const contentId = uid("hover-card-content");
	const open = signal(false);

	let timer: ReturnType<typeof setTimeout> | undefined;

	function clear(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function schedule(next: boolean, delay: number): void {
		clear();
		timer = setTimeout(() => open(next), delay);
	}

	onUnmount(clear);

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => {
			clear();
			open(false);
		},
		placement: props.placement ?? "bottom",
		offset: 8,
		content: () =>
			html`<div
				data-slot="hover-card-content"
				id="${contentId}"
				role="dialog"
				aria-labelledby="${triggerId}"
				class="${cn(
					"bg-popover text-popover-foreground z-50 w-64 rounded-md border p-4 shadow-md outline-none",
					zoomInOut,
					read(props.contentClass),
				)}"
				@pointerenter="${clear}"
				@pointerleave="${() => schedule(false, props.closeDelay ?? CLOSE_DELAY_MS)}"
			>${slot(props.children)}</div>`,
	});

	return html`<span
		data-slot="hover-card-trigger"
		id="${triggerId}"
		class="${() => cn("inline-flex", read(props.class))}"
		@pointerenter="${() => schedule(true, props.openDelay ?? OPEN_DELAY_MS)}"
		@pointerleave="${() => schedule(false, props.closeDelay ?? CLOSE_DELAY_MS)}"
	>${slot(props.trigger)}</span>`;
});
