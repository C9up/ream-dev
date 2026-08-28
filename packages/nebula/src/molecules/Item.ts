/**
 * Item — one row in a list of things.
 *
 * The generic list row: a leading media slot, a title and description, and a
 * trailing action. Sidebar entries, settings rows, search results and command
 * results are all this shape, and each of them growing its own version is how
 * a list of things ends up with four different vertical rhythms.
 *
 * `ItemContent` takes `min-w-0` so a long title truncates instead of pushing
 * the trailing action off the row — the single most common bug in a flex row
 * built by hand.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export const itemVariants = cva(
	"group/item flex flex-wrap items-center rounded-md border border-transparent text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] [a&]:hover:bg-accent/50",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border-border",
				muted: "bg-muted/50",
			},
			size: {
				default: "gap-4 p-4",
				sm: "gap-2.5 px-4 py-3",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

export type ItemVariants = VariantProps<typeof itemVariants>;

export interface ItemProps {
	children?: Slot;
	variant?: Reactive<ItemVariants["variant"]>;
	size?: Reactive<ItemVariants["size"]>;
	class?: Reactive<string>;
}

export const Item = component<ItemProps>((props) => {
	return html`<div
		data-slot="item"
		class="${() =>
			itemVariants({
				variant: read(props.variant),
				size: read(props.size),
				class: read(props.class),
			})}"
	>${slot(props.children)}</div>`;
});

export const ItemGroup = styledDiv(
	"item-group",
	"group/item-group flex flex-col",
);

export const ItemMedia = styledDiv(
	"item-media",
	"flex shrink-0 items-center justify-center gap-2 [&_svg:not([class*='size-'])]:size-4",
);

export const ItemContent = styledDiv(
	"item-content",
	"flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none min-w-0",
);

export const ItemTitle = styledDiv(
	"item-title",
	"flex w-fit items-center gap-2 text-sm leading-snug font-medium",
);

export const ItemDescription = styledDiv(
	"item-description",
	"text-muted-foreground line-clamp-2 text-sm leading-normal font-normal text-balance",
);

export const ItemActions = styledDiv("item-actions", "flex items-center gap-2");

export const ItemSeparator = styledDiv(
	"item-separator",
	"bg-border my-0 h-px w-full",
);
