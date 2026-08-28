/**
 * Toggle — a button that stays pressed.
 *
 * `aria-pressed` rather than a checkbox: the control is a button whose effect
 * applies immediately (bold, mute, filter on), not a value being collected for
 * submission. Screen readers announce it as "toggle button, pressed", which is
 * what the user needs to hear.
 *
 * The variants are exported for ToggleGroup, which reuses them so a grouped
 * toggle and a standalone one cannot drift apart.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { accessor, type Reactive, read, readOr } from "../lib/props.js";

export const toggleVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 whitespace-nowrap",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline:
					"border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
			},
			size: {
				default: "h-9 min-w-9 px-2",
				sm: "h-8 min-w-8 px-1.5",
				lg: "h-10 min-w-10 px-2.5",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

export type ToggleVariants = VariantProps<typeof toggleVariants>;

export interface ToggleProps {
	children?: Slot;
	pressed?: Reactive<boolean>;
	variant?: Reactive<ToggleVariants["variant"]>;
	size?: Reactive<ToggleVariants["size"]>;
	disabled?: Reactive<boolean>;
	label?: Reactive<string | undefined>;
	value?: string;
	class?: Reactive<string>;
	onPressedChange?: (pressed: boolean) => void;
}

export const Toggle = component<ToggleProps>((props) => {
	return html`<button
		type="button"
		data-slot="toggle"
		data-value="${props.value}"
		aria-pressed="${() => (readOr(props.pressed, false) ? "true" : "false")}"
		aria-label="${accessor(props.label, undefined)}"
		?disabled="${accessor(props.disabled, false)}"
		class="${() =>
			toggleVariants({
				variant: read(props.variant),
				size: read(props.size),
				class: read(props.class),
			})}"
		@click="${() => props.onPressedChange?.(!readOr(props.pressed, false))}"
	>${slot(props.children)}</button>`;
});
