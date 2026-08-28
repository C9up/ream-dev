/**
 * Button — the reference component for the whole library.
 *
 * Every other nebula component follows the shape set here, so it is worth
 * reading once:
 *
 * - Variants come from `cva`, exported separately as `buttonVariants` so a
 *   link or a menu item can borrow the button's look without being a button.
 *   shadcn does the same, and half its examples depend on it.
 * - Every prop that can change is `Reactive<T>` and is bound through
 *   `accessor()`. Aurora does not re-render; a value read once at setup is
 *   frozen, so `disabled: form.pending` would be a bug that only shows up
 *   after the first submit.
 * - `data-slot` mirrors shadcn v4, which stamps one on every part. It gives
 *   host CSS and tests a stable hook that does not depend on the utility
 *   classes, which are the part a user is expected to edit.
 *
 * No `asChild`. React's Slot pattern clones an element and merges props into
 * it; Aurora templates are compiled markup with no element to clone. Where
 * shadcn would write `<Button asChild><a/></Button>`, nebula exports the
 * variants and you put them on the anchor yourself — which is what the Slot
 * was doing anyway, with a runtime in between.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
				destructive:
					"bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
				outline:
					"border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
				secondary:
					"bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export interface ButtonProps {
	children?: Slot;
	variant?: Reactive<ButtonVariants["variant"]>;
	size?: Reactive<ButtonVariants["size"]>;
	/** Defaults to `"button"` — never `"submit"`, which is HTML's default and
	 * the cause of most accidental form submissions. */
	type?: Reactive<"button" | "submit" | "reset">;
	disabled?: Reactive<boolean>;
	class?: Reactive<string>;
	id?: string;
	/** Sets `aria-label`. Required in practice for `size: "icon"`. */
	label?: Reactive<string | undefined>;
	onClick?: (event: MouseEvent) => void;
}

export const Button = component<ButtonProps>((props) => {
	// An accessor, not a string: the renderer wraps it in an effect, so the
	// class list tracks whichever of these props were given as signals.
	const classes = (): string =>
		buttonVariants({
			variant: read(props.variant),
			size: read(props.size),
			class: read(props.class),
		});

	return html`<button
		data-slot="button"
		id="${props.id}"
		type="${accessor(props.type, "button")}"
		class="${classes}"
		aria-label="${accessor(props.label, undefined)}"
		?disabled="${accessor(props.disabled, false)}"
		@click="${props.onClick}"
	>${slot(props.children)}</button>`;
});
