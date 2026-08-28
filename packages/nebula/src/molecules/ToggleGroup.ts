/**
 * ToggleGroup — a row of toggles acting as one control.
 *
 * `type` decides both the behaviour and the semantics, and they have to move
 * together. `"single"` is a radio group: one value, `role="radio"` on each
 * button, and picking one clears the rest. `"multiple"` is a set of
 * independent toggle buttons, each with `aria-pressed`.
 *
 * Getting that pairing wrong is the usual bug here — a single-select group
 * announcing each option as "pressed" tells a screen-reader user they can turn
 * several on at once.
 *
 * The classes come from `Toggle`'s own `cva`, so a grouped button and a
 * standalone one cannot drift apart. Only the corner rounding is overridden,
 * to weld the row into one shape.
 */

import { component, html, signal } from "@c9up/aurora";
import { type ToggleVariants, toggleVariants } from "../atoms/Toggle.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface ToggleGroupItem {
	value: string;
	label: Child;
	/** Required when the label is an icon alone. */
	ariaLabel?: string;
	disabled?: boolean;
}

export interface ToggleGroupProps {
	items: readonly ToggleGroupItem[];
	type?: "single" | "multiple";
	defaultValue?: string | readonly string[];
	variant?: Reactive<ToggleVariants["variant"]>;
	size?: Reactive<ToggleVariants["size"]>;
	disabled?: Reactive<boolean>;
	class?: Reactive<string>;
	onValueChange?: (value: readonly string[]) => void;
}

export const ToggleGroup = component<ToggleGroupProps>((props) => {
	const type = props.type ?? "single";
	const selected = signal<readonly string[]>(
		props.defaultValue === undefined
			? []
			: typeof props.defaultValue === "string"
				? [props.defaultValue]
				: props.defaultValue,
	);

	function toggle(value: string): void {
		const current = selected();
		const next =
			type === "single"
				? current.includes(value)
					? []
					: [value]
				: current.includes(value)
					? current.filter((entry) => entry !== value)
					: [...current, value];
		selected(next);
		props.onValueChange?.(next);
	}

	return html`<div
		data-slot="toggle-group"
		role="${type === "single" ? "radiogroup" : "group"}"
		class="${() =>
			cn(
				"group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
				read(props.class),
			)}"
		data-variant="${() => readOr(props.variant, "default")}"
	>
		${props.items.map((item) => renderItem(item, props, type, selected, toggle))}
	</div>`;
});

function renderItem(
	item: ToggleGroupItem,
	props: ToggleGroupProps,
	type: "single" | "multiple",
	selected: () => readonly string[],
	toggle: (value: string) => void,
): Child {
	const on = (): boolean => selected().includes(item.value);

	return html`<button
		type="button"
		data-slot="toggle-group-item"
		data-state="${() => (on() ? "on" : "off")}"
		data-value="${item.value}"
		role="${type === "single" ? "radio" : undefined}"
		aria-checked="${() => (type === "single" ? (on() ? "true" : "false") : undefined)}"
		aria-pressed="${() => (type === "multiple" ? (on() ? "true" : "false") : undefined)}"
		aria-label="${item.ariaLabel}"
		?disabled="${() => item.disabled === true || readOr(props.disabled, false)}"
		class="${() =>
			toggleVariants({
				variant: read(props.variant),
				size: read(props.size),
				class:
					"min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l aria-checked:bg-accent aria-checked:text-accent-foreground",
			})}"
		@click="${() => toggle(item.value)}"
	>${item.label}</button>`;
}
