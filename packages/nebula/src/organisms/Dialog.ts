/**
 * Dialog — a modal window over the page.
 *
 * `modalSurface` supplies the contract (trap, scroll lock, backdrop dismissal,
 * hiding the page from assistive technology); this component supplies the
 * markup and the trigger.
 *
 * The `panel` callback matters more than it looks. The overlay's root spans
 * the viewport so the backdrop can, which means containment has to be answered
 * against the panel — check the root and every click on the page counts as
 * inside, and clicking the backdrop silently stops closing the dialog.
 *
 * `aria-labelledby` points at the title and `aria-describedby` at the
 * description, so a screen reader announces what the dialog is for on open. A
 * dialog with neither announces only "dialog", which is why `title` is
 * required rather than optional — `srOnlyTitle` is there for designs that show
 * no visible heading.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { XIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { fadeInOut, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";

export const dialogBackdropClasses = "fixed inset-0 z-50 bg-black/50";

export const dialogPanelClasses =
	"bg-background fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg outline-none sm:max-w-lg";

export interface DialogProps {
	/** Rendered inside the trigger button. Omit to drive `open` yourself. */
	trigger?: Slot;
	/** Announced on open. Hide it visually with `srOnlyTitle`. */
	title: Child;
	description?: Child;
	children?: Slot;
	/** Actions, laid out bottom-right. */
	footer?: Slot;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Keep the title for screen readers but out of the layout. */
	srOnlyTitle?: boolean;
	/** Hide the corner close button. Escape and the backdrop still work. */
	hideCloseButton?: boolean;
	class?: Reactive<string>;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const Dialog = component<DialogProps>((props) => {
	const triggerId = uid("dialog-trigger");
	const panelId = uid("dialog-panel");
	const titleId = uid("dialog-title");
	const descriptionId = uid("dialog-description");

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
			html`<div data-slot="dialog-overlay" class="${cn("fixed inset-0 z-50", fadeInOut)}">
				<div data-slot="dialog-backdrop" class="${dialogBackdropClasses}"></div>
				<div
					data-slot="dialog-content"
					id="${panelId}"
					role="dialog"
					aria-modal="true"
					aria-labelledby="${titleId}"
					aria-describedby="${props.description === undefined ? undefined : descriptionId}"
					tabindex="-1"
					class="${cn(dialogPanelClasses, zoomInOut, read(props.contentClass))}"
				>
					<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
						<h2
							id="${titleId}"
							data-slot="dialog-title"
							class="${cn(
								"text-lg leading-none font-semibold",
								props.srOnlyTitle === true ? "sr-only" : "",
							)}"
						>${props.title}</h2>
						${
							props.description === undefined
								? null
								: html`<p
									id="${descriptionId}"
									data-slot="dialog-description"
									class="text-muted-foreground text-sm"
								>${props.description}</p>`
						}
					</div>
					${slot(props.children)}
					${
						props.footer === undefined
							? null
							: html`<div
								data-slot="dialog-footer"
								class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
							>${slot(props.footer)}</div>`
					}
					${
						props.hideCloseButton === true
							? null
							: html`<button
								type="button"
								data-slot="dialog-close"
								class="ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								@click="${() => state.set(false)}"
							>
								${XIcon({ class: "size-4" })}
								<span class="sr-only">Close</span>
							</button>`
					}
				</div>
			</div>`,
	});

	if (props.trigger === undefined) {
		// No trigger: the dialog is driven entirely by the `open` prop. Something
		// still has to be in the tree for the component to mount into, and the
		// surface itself lives in a portal.
		return html`<span data-slot="dialog" hidden></span>`;
	}

	return html`<button
		type="button"
		data-slot="dialog-trigger"
		id="${triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (state.current() ? "true" : "false")}"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(true)}"
	>${slot(props.trigger)}</button>`;
});

/** A dialog driven purely by a signal, with no trigger of its own. */
export function useDialog(initial = false): {
	open: () => boolean;
	show(): void;
	hide(): void;
} {
	const open = signal(initial);
	return {
		open: () => open(),
		show: () => open(true),
		hide: () => open(false),
	};
}
