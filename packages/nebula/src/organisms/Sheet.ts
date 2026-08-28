/**
 * Sheet — a panel that slides in from an edge.
 *
 * Structurally a Dialog whose panel is pinned to a side rather than centred,
 * so it shares `modalSurface` and everything that comes with it. What differs
 * is the motion: it translates rather than scaling, and the distance depends
 * on the panel's own size, which only `translate-x-full` knows. That is why
 * `slideFrom` produces a transition and not a keyframe animation.
 *
 * `inset-y-0` for the side panels and `inset-x-0` for the top and bottom ones
 * is what makes the sheet span its edge; the opposite axis takes the width or
 * height. Getting that pair the wrong way round produces a panel floating in a
 * corner, which is the usual first attempt.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { XIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { fadeInOut, slideFrom } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Side } from "../primitives/floating.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { dialogBackdropClasses } from "./Dialog.js";

export interface SheetProps {
	trigger?: Slot;
	title: Child;
	description?: Child;
	children?: Slot;
	footer?: Slot;
	/** Which edge it comes from. Default `"right"`. */
	side?: Side;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	srOnlyTitle?: boolean;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

/** Edge placement and the axis the panel is sized on. */
function panelClassesFor(side: Side): string {
	if (side === "left") {
		return "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm";
	}
	if (side === "right") {
		return "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm";
	}
	if (side === "top") return "inset-x-0 top-0 h-auto border-b";
	return "inset-x-0 bottom-0 h-auto border-t";
}

export const Sheet = component<SheetProps>((props) => {
	const side = props.side ?? "right";
	const triggerId = uid("sheet-trigger");
	const panelId = uid("sheet-panel");
	const titleId = uid("sheet-title");
	const descriptionId = uid("sheet-description");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	modalSurface({
		open: () => state.current(),
		onClose: () => state.set(false),
		panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
		returnFocus: () => document.getElementById(triggerId),
		content: () =>
			html`<div data-slot="sheet-overlay" class="${cn("fixed inset-0 z-50", fadeInOut)}">
				<div class="${dialogBackdropClasses}"></div>
				<div
					data-slot="sheet-content"
					data-side="${side}"
					id="${panelId}"
					role="dialog"
					aria-modal="true"
					aria-labelledby="${titleId}"
					aria-describedby="${props.description === undefined ? undefined : descriptionId}"
					tabindex="-1"
					class="${cn(
						"bg-background fixed z-50 flex flex-col gap-4 p-6 shadow-lg outline-none",
						panelClassesFor(side),
						slideFrom(side),
						read(props.contentClass),
					)}"
				>
					<div data-slot="sheet-header" class="flex flex-col gap-1.5">
						<h2
							id="${titleId}"
							class="${cn(
								"text-foreground font-semibold",
								props.srOnlyTitle === true ? "sr-only" : "",
							)}"
						>${props.title}</h2>
						${
							props.description === undefined
								? null
								: html`<p id="${descriptionId}" class="text-muted-foreground text-sm">
									${props.description}
								</p>`
						}
					</div>
					<div data-slot="sheet-body" class="flex-1 overflow-y-auto">${slot(props.children)}</div>
					${
						props.footer === undefined
							? null
							: html`<div data-slot="sheet-footer" class="mt-auto flex flex-col gap-2">
								${slot(props.footer)}
							</div>`
					}
					<button
						type="button"
						data-slot="sheet-close"
						class="ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
						@click="${() => state.set(false)}"
					>
						${XIcon({ class: "size-4" })}
						<span class="sr-only">Close</span>
					</button>
				</div>
			</div>`,
	});

	if (props.trigger === undefined) {
		return html`<span data-slot="sheet" hidden></span>`;
	}

	return html`<button
		type="button"
		data-slot="sheet-trigger"
		id="${triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (state.current() ? "true" : "false")}"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(true)}"
	>${slot(props.trigger)}</button>`;
});
