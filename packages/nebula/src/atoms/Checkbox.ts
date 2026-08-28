/**
 * Checkbox.
 *
 * Radix renders a `<button role="checkbox">` plus a hidden input, because it
 * needs a element it can put arbitrary children in. nebula keeps the native
 * `<input type="checkbox">` and styles it with `appearance-none`.
 *
 * That is not just simpler, it is better behaved: the control participates in
 * form submission and reset on its own, `:checked` and `:indeterminate` drive
 * the visuals with no state to synchronise, and the label association through
 * `for` works without a click forwarder. The tick and dash are siblings shown
 * by `peer-checked:` / `peer-indeterminate:`, so the whole component is
 * declarative — no JavaScript runs when the box is toggled.
 *
 * `indeterminate` is bound as a property because there is no attribute for it;
 * it exists only in the DOM.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { CheckIcon, MinusIcon } from "../lib/icons.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export const checkboxClasses =
	"peer size-4 shrink-0 appearance-none rounded-[4px] border border-input bg-transparent shadow-xs outline-none transition-shadow dark:bg-input/30 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export interface CheckboxProps {
	id?: string;
	name?: string;
	value?: string;
	checked?: Reactive<boolean>;
	/** The mixed state — a parent box over partially selected children. */
	indeterminate?: Reactive<boolean>;
	disabled?: Reactive<boolean>;
	required?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	/**
	 * Accessible name, for a checkbox with no visible `<label>`.
	 *
	 * A checkbox in a table row or a toolbar has its meaning from what is beside
	 * it, which a screen reader does not see — it announces "checkbox, unchecked"
	 * and nothing else. Every such use needs this.
	 */
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onCheckedChange?: (checked: boolean, event: Event) => void;
}

function inputChecked(event: Event): boolean {
	const target = event.target;
	return target instanceof HTMLInputElement ? target.checked : false;
}

export const Checkbox = component<CheckboxProps>((props) => {
	const marker =
		"pointer-events-none absolute inset-0 size-4 p-px text-primary-foreground opacity-0 transition-opacity";

	return html`<span data-slot="checkbox" class="relative inline-flex size-4 shrink-0">
		<input
			type="checkbox"
			id="${props.id}"
			name="${props.name}"
			value="${props.value}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			aria-label="${accessor(props.label, undefined)}"
			?disabled="${accessor(props.disabled, false)}"
			?required="${accessor(props.required, false)}"
			.checked="${accessor(props.checked, false)}"
			.indeterminate="${accessor(props.indeterminate, false)}"
			class="${() => cn(checkboxClasses, read(props.class))}"
			@change="${(event: Event) => props.onCheckedChange?.(inputChecked(event), event)}"
		/>
		${CheckIcon({ class: cn(marker, "peer-checked:opacity-100 peer-indeterminate:opacity-0") })}
		${MinusIcon({ class: cn(marker, "peer-indeterminate:opacity-100") })}
	</span>`;
});
