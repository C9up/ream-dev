/**
 * Badge — a small status or count marker.
 *
 * Exported variants as well as the component, for the same reason as Button:
 * a badge is often a link to the thing it counts, and an anchor needs the
 * classes without the element.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read } from "../lib/props.js";

export const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
				destructive:
					"border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20",
				outline:
					"text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;

export interface BadgeProps {
	children?: Slot;
	variant?: Reactive<BadgeVariants["variant"]>;
	class?: Reactive<string>;
}

export const Badge = component<BadgeProps>((props) => {
	return html`<span
		data-slot="badge"
		class="${() => badgeVariants({ variant: read(props.variant), class: read(props.class) })}"
	>${slot(props.children)}</span>`;
});
