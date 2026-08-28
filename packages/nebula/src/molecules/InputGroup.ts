/**
 * InputGroup — an input with something attached to it.
 *
 * A currency prefix, a `.com` suffix, a search icon, a clear button. The group
 * carries the border and the focus ring; the input inside is stripped bare.
 *
 * `focus-within:` is what moves the ring onto the wrapper, so focusing the
 * input lights up the whole control including the addons. Styling the input's
 * own `:focus-visible` would draw a ring around the middle third of a control
 * that visually reads as one box.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export interface InputGroupProps {
	children?: Slot;
	/** Before the input — an icon or a static prefix. */
	leading?: Slot;
	/** After the input — a unit, a button, a spinner. */
	trailing?: Slot;
	invalid?: Reactive<boolean>;
	disabled?: Reactive<boolean>;
	class?: Reactive<string>;
}

/**
 * Strip the inner input of its own chrome.
 *
 * Exported so a caller passing a plain `<input>` rather than nebula's `Input`
 * can apply it too — without this the input draws a second border inside the
 * group's, which is the one way this component visibly goes wrong.
 */
export const inputGroupControlClasses =
	"flex-1 border-0 bg-transparent px-0 shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 disabled:opacity-100";

export const InputGroup = component<InputGroupProps>((props) => {
	return html`<div
		data-slot="input-group"
		data-disabled="${() => (read(props.disabled) === true ? "" : undefined)}"
		aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
		class="${() =>
			cn(
				"border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow]",
				"focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				`[&_input]:${inputGroupControlClasses.split(" ").join(" [&_input]:")}`,
				read(props.class),
			)}"
	>
		${slot(props.leading)}${slot(props.children)}${slot(props.trailing)}
	</div>`;
});

export const InputGroupAddon = styledDiv(
	"input-group-addon",
	"text-muted-foreground flex shrink-0 items-center gap-2 [&_svg:not([class*='size-'])]:size-4",
);
