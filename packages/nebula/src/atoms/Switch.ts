/**
 * Switch — an on/off toggle that applies immediately.
 *
 * Same native-input approach as Checkbox, with `role="switch"` so assistive
 * technology announces "on/off" rather than "checked". The distinction is not
 * cosmetic: a checkbox is a choice you confirm by submitting, a switch is a
 * setting that takes effect the moment you flip it.
 *
 * The thumb is a sibling translated by `peer-checked:`, not a pseudo-element,
 * so the travel distance stays expressible in utility classes and a user can
 * retune the size without leaving the class string.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export const switchTrackClasses =
	"peer absolute inset-0 size-full appearance-none rounded-full border border-transparent bg-input shadow-xs outline-none transition-colors dark:bg-input/80 checked:bg-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

export interface SwitchProps {
	id?: string;
	name?: string;
	checked?: Reactive<boolean>;
	disabled?: Reactive<boolean>;
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onCheckedChange?: (checked: boolean, event: Event) => void;
}

function inputChecked(event: Event): boolean {
	const target = event.target;
	return target instanceof HTMLInputElement ? target.checked : false;
}

export const Switch = component<SwitchProps>((props) => {
	return html`<span
		data-slot="switch"
		class="${() => cn("relative inline-flex h-[1.15rem] w-8 shrink-0 items-center", read(props.class))}"
	>
		<input
			type="checkbox"
			role="switch"
			id="${props.id}"
			name="${props.name}"
			aria-label="${accessor(props.label, undefined)}"
			?disabled="${accessor(props.disabled, false)}"
			.checked="${accessor(props.checked, false)}"
			class="${switchTrackClasses}"
			@change="${(event: Event) => props.onCheckedChange?.(inputChecked(event), event)}"
		/>
		<span
			class="pointer-events-none ml-px block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform peer-checked:translate-x-[calc(100%-2px)] dark:peer-checked:bg-primary-foreground"
		></span>
	</span>`;
});
