/**
 * Field — a form control with its label, hint and error.
 *
 * The reason this exists rather than each form writing the four elements by
 * hand is the wiring. A control must point at its description and its error
 * with `aria-describedby`, and at its own label with `for`/`id`. Done by hand
 * that is three ids to invent and keep in step per field, and the failure is
 * silent — a sighted user sees the error, a screen-reader user does not.
 *
 * `Field` mints the ids and returns them, so the control gets them by
 * destructuring rather than by convention:
 *
 *   const email = fieldIds()
 *   Field({
 *     ids: email,
 *     label: "Email",
 *     error: () => errors.email,
 *     children: Input({ id: email.control, describedBy: email.describedBy, invalid: … }),
 *   })
 *
 * The error slot is reactive and empty-tolerant: passing `() => errors.email`
 * renders nothing until there is something to render, so a field does not
 * reserve a blank line for an error that has not happened.
 */

import { component, html } from "@c9up/aurora";
import { Label } from "../atoms/Label.js";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export interface FieldIds {
	/** Put on the control. The label's `for` points here. */
	readonly control: string;
	readonly label: string;
	readonly description: string;
	readonly error: string;
	/** Ready-made `aria-describedby` naming both the description and the error. */
	readonly describedBy: string;
}

/** Mint the id set for one field. Call once, in the component that owns it. */
export function fieldIds(): FieldIds {
	const control = uid("field");
	const description = `${control}-description`;
	const error = `${control}-error`;
	return {
		control,
		label: `${control}-label`,
		description,
		error,
		// Both are named unconditionally. A screen reader skips an id that
		// resolves to nothing, so listing an absent error is harmless — whereas
		// recomputing the attribute when an error appears means the control has to
		// re-render, which Aurora does not do.
		describedBy: `${description} ${error}`,
	};
}

export interface FieldProps {
	ids: FieldIds;
	label?: Child;
	/** The control itself. */
	children?: Slot;
	/** Static help text under the control. */
	description?: Child;
	/** Validation message. Reactive — renders nothing while absent. */
	error?: Reactive<string | undefined>;
	required?: boolean;
	disabled?: Reactive<boolean>;
	orientation?: "vertical" | "horizontal";
	class?: Reactive<string>;
}

export const Field = component<FieldProps>((props) => {
	const horizontal = props.orientation === "horizontal";

	return html`<div
		data-slot="field"
		data-disabled="${() => (read(props.disabled) === true ? "true" : undefined)}"
		class="${() =>
			cn(
				"group flex gap-2",
				horizontal ? "flex-row items-center justify-between" : "flex-col",
				read(props.class),
			)}"
	>
		${
			props.label === undefined
				? null
				: Label({
						for: props.ids.control,
						id: props.ids.label,
						children: html`${props.label}${
							props.required === true
								? html`<span aria-hidden="true" class="text-destructive">*</span>`
								: null
						}`,
					})
		}
		${slot(props.children)}
		${
			props.description === undefined
				? null
				: html`<p
					data-slot="field-description"
					id="${props.ids.description}"
					class="text-muted-foreground text-sm"
				>${props.description}</p>`
		}
		<p
			data-slot="field-error"
			id="${props.ids.error}"
			role="alert"
			class="text-destructive text-sm empty:hidden"
		>${() => read(props.error) ?? ""}</p>
	</div>`;
});

export const FieldGroup = styledDiv(
	"field-group",
	"flex w-full flex-col gap-6",
);

export const FieldSeparator = styledDiv(
	"field-separator",
	"bg-border h-px w-full",
);
