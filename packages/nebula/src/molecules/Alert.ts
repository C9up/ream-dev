/**
 * Alert — an inline message about the surrounding content.
 *
 * `role="alert"` only for the destructive variant. The role is a live region:
 * it interrupts a screen reader the moment the element appears. That is right
 * for an error and wrong for the informational variant, which would talk over
 * whatever the user was reading to announce something they did not ask about.
 *
 * The grid layout is what lets an optional leading icon align with the title
 * while the description wraps under both, without either part knowing whether
 * the other is present.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export const alertVariants = cva(
	"relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				destructive:
					"text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export type AlertVariants = VariantProps<typeof alertVariants>;

export interface AlertProps {
	children?: Slot;
	variant?: Reactive<AlertVariants["variant"]>;
	class?: Reactive<string>;
}

export const Alert = component<AlertProps>((props) => {
	return html`<div
		data-slot="alert"
		role="${() => (readOr(props.variant, "default") === "destructive" ? "alert" : "note")}"
		class="${() => alertVariants({ variant: read(props.variant), class: read(props.class) })}"
	>${slot(props.children)}</div>`;
});

export const AlertTitle = styledDiv(
	"alert-title",
	"col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
);

export const AlertDescription = styledDiv(
	"alert-description",
	"text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
);
