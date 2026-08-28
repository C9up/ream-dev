/**
 * RadioGroup — pick exactly one option.
 *
 * Native `<input type="radio">` throughout. The browser already implements the
 * radio group pattern on a shared `name`: arrows move and select, only one can
 * be checked, and the group is one tab stop. Radix reimplements all of that
 * because it needs a stylable element; `appearance-none` gets nebula the same
 * styling freedom while the behaviour stays the browser's.
 *
 * The indicator dot is a sibling shown by `peer-checked:`, so selecting a
 * radio runs no JavaScript at all.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface RadioOption {
	value: string;
	label: Child;
	description?: Child;
	disabled?: boolean;
}

export interface RadioGroupProps {
	/** Shared `name`, which is what makes the browser treat these as one group. */
	name: string;
	options: readonly RadioOption[];
	value?: Reactive<string | undefined>;
	defaultValue?: string;
	disabled?: Reactive<boolean>;
	orientation?: "vertical" | "horizontal";
	class?: Reactive<string>;
	onValueChange?: (value: string) => void;
}

const radioClasses =
	"peer size-4 shrink-0 appearance-none rounded-full border border-input bg-transparent shadow-xs outline-none transition-shadow dark:bg-input/30 checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

export const RadioGroup = component<RadioGroupProps>((props) => {
	const selected = (): string | undefined => {
		const controlled = read(props.value);
		return controlled === undefined ? props.defaultValue : controlled;
	};

	return html`<div
		role="radiogroup"
		data-slot="radio-group"
		aria-orientation="${props.orientation ?? "vertical"}"
		class="${() =>
			cn(
				"grid gap-3",
				props.orientation === "horizontal" ? "grid-flow-col auto-cols-max" : "",
				read(props.class),
			)}"
	>
		${props.options.map((option) => renderOption(option, props, selected))}
	</div>`;
});

function renderOption(
	option: RadioOption,
	props: RadioGroupProps,
	selected: () => string | undefined,
): Child {
	const id = uid("radio");
	const descriptionId =
		option.description === undefined ? undefined : uid("radio-description");

	return html`<div class="flex items-start gap-3">
		<span class="relative flex size-4 shrink-0 items-center justify-center">
			<input
				type="radio"
				data-slot="radio-group-item"
				id="${id}"
				name="${props.name}"
				value="${option.value}"
				aria-describedby="${descriptionId}"
				?disabled="${() => option.disabled === true || readOr(props.disabled, false)}"
				.checked="${() => selected() === option.value}"
				class="${radioClasses}"
				@change="${() => props.onValueChange?.(option.value)}"
			/>
			<span
				class="bg-primary pointer-events-none absolute size-2 rounded-full opacity-0 transition-opacity peer-checked:opacity-100"
			></span>
		</span>
		<div class="grid gap-1 leading-none">
			<label
				for="${id}"
				class="text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
			>${option.label}</label>
			${
				option.description === undefined
					? null
					: html`<p id="${descriptionId}" class="text-muted-foreground text-sm">
						${option.description}
					</p>`
			}
		</div>
	</div>`;
}
