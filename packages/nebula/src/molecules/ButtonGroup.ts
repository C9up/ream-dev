/**
 * ButtonGroup — buttons welded into one control.
 *
 * `role="group"` with a label, so a screen reader announces the set before its
 * members rather than three unrelated buttons in a row.
 *
 * The rounding and border collapsing are done with `:first-child` /
 * `:last-child` selectors on the group rather than props on each button. That
 * is what lets the members stay ordinary `Button` calls — adding one does not
 * mean re-deciding which button is now on the end.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export interface ButtonGroupProps {
	children?: Slot;
	orientation?: "horizontal" | "vertical";
	/** Announced before the group's contents. */
	label?: string;
	class?: Reactive<string>;
}

export const ButtonGroup = component<ButtonGroupProps>((props) => {
	const vertical = props.orientation === "vertical";

	return html`<div
		data-slot="button-group"
		role="group"
		aria-label="${props.label}"
		data-orientation="${vertical ? "vertical" : "horizontal"}"
		class="${() =>
			cn(
				"flex w-fit items-stretch",
				vertical
					? "flex-col [&>*]:rounded-none [&>*:first-child]:rounded-t-md [&>*:last-child]:rounded-b-md [&>*:not(:first-child)]:-mt-px"
					: "[&>*]:rounded-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px",
				"[&>*]:focus-visible:z-10 [&>*]:focus:z-10",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`;
});

export const ButtonGroupSeparator = styledDiv(
	"button-group-separator",
	"bg-input relative !m-0 self-stretch w-px",
);

export const ButtonGroupText = styledDiv(
	"button-group-text",
	"bg-muted text-muted-foreground flex items-center gap-2 border px-4 text-sm font-medium",
);
