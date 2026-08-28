/**
 * Input — a single-line text field.
 *
 * The value binding is the part that differs from React and is worth calling
 * out. `.value` is a *property* slot, not an attribute: setting the `value`
 * attribute only seeds the initial value, and after the user types once the
 * attribute and the property diverge. Binding the property is what keeps a
 * signal and the field in step in both directions.
 *
 * There is no controlled/uncontrolled split. Pass a signal and the field is
 * controlled; pass nothing and the DOM owns the value, which is the right
 * default for a form posted the classic way — the shape aurora apps use.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export const inputClasses =
	"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

export interface InputProps {
	id?: string;
	name?: string;
	type?: Reactive<string>;
	value?: Reactive<string>;
	placeholder?: Reactive<string>;
	autocomplete?: string;
	disabled?: Reactive<boolean>;
	readonly?: Reactive<boolean>;
	required?: Reactive<boolean>;
	/** Renders `aria-invalid`, which the focus ring and border both key off. */
	invalid?: Reactive<boolean>;
	/** Names the element describing the error, for screen readers. */
	describedBy?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onInput?: (value: string, event: Event) => void;
	onChange?: (value: string, event: Event) => void;
	onBlur?: (event: FocusEvent) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * Pull the current text out of an input event.
 *
 * Reads the target rather than trusting the caller to, so a handler receives a
 * plain string. The guard is not defensive padding: `event.target` is typed as
 * the general `EventTarget`, and narrowing it here is what keeps the callback
 * signature honest without a cast at every call site.
 */
function inputValue(event: Event): string {
	const target = event.target;
	return target instanceof HTMLInputElement ? target.value : "";
}

export const Input = component<InputProps>((props) => {
	return html`<input
		data-slot="input"
		id="${props.id}"
		name="${props.name}"
		type="${accessor(props.type, "text")}"
		placeholder="${accessor(props.placeholder, undefined)}"
		autocomplete="${props.autocomplete}"
		aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
		aria-describedby="${accessor(props.describedBy, undefined)}"
		?disabled="${accessor(props.disabled, false)}"
		?readonly="${accessor(props.readonly, false)}"
		?required="${accessor(props.required, false)}"
		.value="${accessor(props.value, "")}"
		class="${() => cn(inputClasses, read(props.class))}"
		@input="${(event: Event) => props.onInput?.(inputValue(event), event)}"
		@change="${(event: Event) => props.onChange?.(inputValue(event), event)}"
		@blur="${props.onBlur}"
		@keydown="${props.onKeyDown}"
	/>`;
});
