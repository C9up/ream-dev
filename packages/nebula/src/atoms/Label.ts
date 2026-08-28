/**
 * Label — the caption for a form control.
 *
 * Radix's Label exists mostly to stop a click on the label from selecting its
 * text on double-click, and to forward clicks to the control. The browser
 * already does the forwarding through `for`, so nebula keeps the native
 * element and only adds `select-none`.
 *
 * The disabled styling is driven from outside: `peer-disabled:` picks up a
 * sibling control marked disabled, `group-data-[disabled=true]:` picks up a
 * wrapping `Field`. Both are why the label dims without being told anything
 * about the control it captions.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export const labelClasses =
	"flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export interface LabelProps {
	children?: Slot;
	/** The `id` of the control this labels. */
	for?: string;
	id?: string;
	class?: Reactive<string>;
}

export const Label = component<LabelProps>((props) => {
	return html`<label
		data-slot="label"
		id="${props.id}"
		for="${props.for}"
		class="${() => cn(labelClasses, read(props.class))}"
	>${slot(props.children)}</label>`;
});
