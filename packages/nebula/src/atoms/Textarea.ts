/**
 * Textarea — a multi-line text field.
 *
 * Mirrors `Input` deliberately, down to the prop names: a form field should
 * not need a different shape because it grew a second line. The `field-sizing-
 * content` utility is the one addition — it lets the browser grow the box with
 * its content, which used to require a resize observer and a scroll-height
 * measurement on every keystroke.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export const textareaClasses =
	"border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export interface TextareaProps {
	id?: string;
	name?: string;
	value?: Reactive<string>;
	placeholder?: Reactive<string>;
	rows?: Reactive<number>;
	disabled?: Reactive<boolean>;
	readonly?: Reactive<boolean>;
	required?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	describedBy?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onInput?: (value: string, event: Event) => void;
	onChange?: (value: string, event: Event) => void;
	onBlur?: (event: FocusEvent) => void;
}

function inputValue(event: Event): string {
	const target = event.target;
	return target instanceof HTMLTextAreaElement ? target.value : "";
}

export const Textarea = component<TextareaProps>((props) => {
	return html`<textarea
		data-slot="textarea"
		id="${props.id}"
		name="${props.name}"
		placeholder="${accessor(props.placeholder, undefined)}"
		rows="${accessor(props.rows, undefined)}"
		aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
		aria-describedby="${accessor(props.describedBy, undefined)}"
		?disabled="${accessor(props.disabled, false)}"
		?readonly="${accessor(props.readonly, false)}"
		?required="${accessor(props.required, false)}"
		.value="${accessor(props.value, "")}"
		class="${() => cn(textareaClasses, read(props.class))}"
		@input="${(event: Event) => props.onInput?.(inputValue(event), event)}"
		@change="${(event: Event) => props.onChange?.(inputValue(event), event)}"
		@blur="${props.onBlur}"
	></textarea>`;
});
