/**
 * Drawer — a bottom sheet you can swipe away.
 *
 * A Sheet from the bottom edge, plus the one gesture that makes it feel native
 * on a phone: drag the panel down to dismiss it.
 *
 * The drag rules are what separate this from a panel that merely follows the
 * finger:
 *
 * - Downward only. Dragging up would peel the panel off its edge and leave a
 *   gap under it.
 * - Released past a threshold, it closes; short of it, it springs back. A
 *   distance threshold alone punishes a fast flick, so velocity counts too —
 *   a quick short drag dismisses, which is what the gesture means.
 * - The transition is disabled during the drag and restored on release.
 *   Leaving it on makes the panel lag the finger by its own duration, which
 *   reads as a broken gesture rather than a smooth one.
 *
 * The grab handle is decorative. Everything the drag does, the close button,
 * Escape and the backdrop already do — a gesture must never be the only way
 * out of a modal surface.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { fadeInOut, slideFrom } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { dialogBackdropClasses } from "./Dialog.js";

/** Drag this far down and release to dismiss, in px. */
const DISMISS_DISTANCE = 120;
/** Or release faster than this, in px per millisecond. */
const DISMISS_VELOCITY = 0.5;

export interface DrawerProps {
	trigger?: Slot;
	title: Child;
	description?: Child;
	children?: Slot;
	footer?: Slot;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Turn off drag-to-dismiss — for a drawer holding a scrollable list. */
	disableDrag?: boolean;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const Drawer = component<DrawerProps>((props) => {
	const triggerId = uid("drawer-trigger");
	const panelId = uid("drawer-panel");
	const titleId = uid("drawer-title");
	const descriptionId = uid("drawer-description");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	function onPointerDown(event: PointerEvent): void {
		if (props.disableDrag === true) return;
		const panel = document.getElementById(panelId);
		if (panel === null) return;

		const startY = event.clientY;
		const startedAt = performance.now();
		let offset = 0;
		panel.setPointerCapture(event.pointerId);
		panel.style.transition = "none";

		const onMove = (move: PointerEvent): void => {
			offset = Math.max(0, move.clientY - startY);
			panel.style.transform = `translateY(${offset}px)`;
		};

		const onUp = (): void => {
			panel.releasePointerCapture(event.pointerId);
			panel.removeEventListener("pointermove", onMove);
			panel.removeEventListener("pointerup", onUp);
			panel.removeEventListener("pointercancel", onUp);

			// Restore the transition before deciding, so both outcomes animate.
			panel.style.transition = "";
			const velocity = offset / Math.max(1, performance.now() - startedAt);

			if (offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
				panel.style.transform = "";
				state.set(false);
			} else {
				panel.style.transform = "";
			}
		};

		panel.addEventListener("pointermove", onMove);
		panel.addEventListener("pointerup", onUp);
		panel.addEventListener("pointercancel", onUp);
	}

	modalSurface({
		open: () => state.current(),
		onClose: () => state.set(false),
		panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
		returnFocus: () => document.getElementById(triggerId),
		content: () =>
			html`<div data-slot="drawer-overlay" class="${cn("fixed inset-0 z-50", fadeInOut)}">
				<div class="${dialogBackdropClasses}"></div>
				<div
					data-slot="drawer-content"
					id="${panelId}"
					role="dialog"
					aria-modal="true"
					aria-labelledby="${titleId}"
					aria-describedby="${props.description === undefined ? undefined : descriptionId}"
					tabindex="-1"
					class="${cn(
						"bg-background fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[80vh] touch-none flex-col gap-4 rounded-t-lg border-t p-6 shadow-lg outline-none",
						slideFrom("bottom"),
						read(props.contentClass),
					)}"
					@pointerdown="${onPointerDown}"
				>
					<div
						data-slot="drawer-handle"
						aria-hidden="true"
						class="bg-muted mx-auto h-1.5 w-12 shrink-0 rounded-full"
					></div>
					<div class="flex flex-col gap-1.5 text-center sm:text-left">
						<h2 id="${titleId}" class="text-foreground font-semibold">${props.title}</h2>
						${
							props.description === undefined
								? null
								: html`<p id="${descriptionId}" class="text-muted-foreground text-sm">
									${props.description}
								</p>`
						}
					</div>
					<div class="flex-1 overflow-y-auto">${slot(props.children)}</div>
					${
						props.footer === undefined
							? null
							: html`<div class="mt-auto flex flex-col gap-2">${slot(props.footer)}</div>`
					}
				</div>
			</div>`,
	});

	if (props.trigger === undefined) {
		return html`<span data-slot="drawer" hidden></span>`;
	}

	return html`<button
		type="button"
		data-slot="drawer-trigger"
		id="${triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (state.current() ? "true" : "false")}"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(true)}"
	>${slot(props.trigger)}</button>`;
});
