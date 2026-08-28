/**
 * AlertDialog — a modal that interrupts to ask something.
 *
 * The differences from Dialog are all about refusing to be dismissed by
 * accident, because the user is being asked to confirm something they cannot
 * undo:
 *
 * - `role="alertdialog"`, which tells assistive technology this is not merely
 *   a window but a message requiring a response.
 * - No close button and no backdrop dismissal. Both are the "click somewhere
 *   else and it goes away" gesture, and an accidental dismissal of "delete
 *   this?" reads as a cancel — the safe answer — but leaves the user unsure
 *   which one they gave.
 * - Escape still closes. It is unambiguous and deliberate, and taking it away
 *   would trap a keyboard user in the dialog.
 * - Focus starts on **Cancel**, not the action. The destructive button is the
 *   one the user must reach for on purpose.
 */

import { component, html } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { fadeInOut, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { dialogBackdropClasses, dialogPanelClasses } from "./Dialog.js";

export interface AlertDialogProps {
	trigger?: Slot;
	title: Child;
	description: Child;
	/** Label for the confirming action. Default `"Continue"`. */
	actionLabel?: Child;
	/** Label for the way out. Default `"Cancel"`. */
	cancelLabel?: Child;
	/** Styles the action as destructive. */
	destructive?: boolean;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	onConfirm?: () => void;
	onCancel?: () => void;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const AlertDialog = component<AlertDialogProps>((props) => {
	const triggerId = uid("alert-dialog-trigger");
	const panelId = uid("alert-dialog-panel");
	const titleId = uid("alert-dialog-title");
	const descriptionId = uid("alert-dialog-description");
	const cancelId = uid("alert-dialog-cancel");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	function cancel(): void {
		props.onCancel?.();
		state.set(false);
	}

	function confirm(): void {
		props.onConfirm?.();
		state.set(false);
	}

	modalSurface({
		open: () => state.current(),
		onClose: cancel,
		panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
		initialFocus: (panel) => panel.querySelector(`#${CSS.escape(cancelId)}`),
		returnFocus: () => document.getElementById(triggerId),
		dismissOnOutside: false,
		content: () =>
			html`<div data-slot="alert-dialog-overlay" class="${cn("fixed inset-0 z-50", fadeInOut)}">
				<div class="${dialogBackdropClasses}"></div>
				<div
					data-slot="alert-dialog-content"
					id="${panelId}"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="${titleId}"
					aria-describedby="${descriptionId}"
					tabindex="-1"
					class="${cn(dialogPanelClasses, zoomInOut, read(props.contentClass))}"
				>
					<div class="flex flex-col gap-2 text-center sm:text-left">
						<h2 id="${titleId}" class="text-lg font-semibold">${props.title}</h2>
						<p id="${descriptionId}" class="text-muted-foreground text-sm">
							${props.description}
						</p>
					</div>
					<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							id="${cancelId}"
							data-slot="alert-dialog-cancel"
							class="${buttonVariants({ variant: "outline" })}"
							@click="${cancel}"
						>${props.cancelLabel ?? "Cancel"}</button>
						<button
							type="button"
							data-slot="alert-dialog-action"
							class="${buttonVariants({
								variant: props.destructive === true ? "destructive" : "default",
							})}"
							@click="${confirm}"
						>${props.actionLabel ?? "Continue"}</button>
					</div>
				</div>
			</div>`,
	});

	if (props.trigger === undefined) {
		return html`<span data-slot="alert-dialog" hidden></span>`;
	}

	return html`<button
		type="button"
		data-slot="alert-dialog-trigger"
		id="${triggerId}"
		aria-haspopup="dialog"
		class="${() => cn(read(props.triggerClass))}"
		@click="${() => state.set(true)}"
	>${slot(props.trigger)}</button>`;
});
