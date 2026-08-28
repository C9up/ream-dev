/**
 * Purely presentational parts.
 *
 * A compound component like Card is one interesting element and half a dozen
 * styled boxes — `CardHeader`, `CardContent`, `CardFooter` and friends carry a
 * class string, a `data-slot`, and nothing else. Written out longhand that is
 * eight near-identical lines each, thirty times over, and the differences that
 * matter get lost in the repetition.
 *
 * So the boxes are declared, not written:
 *
 *   export const CardHeader = styledDiv("card-header", "flex flex-col gap-1.5 px-6")
 *
 * Only for parts with no behaviour. The moment one needs an event, a piece of
 * state or an ARIA relationship it gets written out in full — hiding those
 * behind a factory is how a component becomes hard to read, which matters
 * doubly here because the registry copies this source into user projects for
 * them to edit.
 */

import { component, html, type TemplateResult } from "@c9up/aurora";
import { type Slot, slot } from "./children.js";
import { cn } from "./cn.js";
import { type Reactive, read } from "./props.js";

export interface StyledProps {
	children?: Slot;
	class?: Reactive<string>;
	id?: string;
}

/** A `<div>` carrying a `data-slot` and a base class list. */
export function styledDiv(
	name: string,
	base: string,
): (props?: StyledProps) => TemplateResult {
	return component<StyledProps>(
		(props) =>
			html`<div
				data-slot="${name}"
				id="${props.id}"
				class="${() => cn(base, read(props.class))}"
			>${slot(props.children)}</div>`,
	);
}

/** The same, as an inline `<span>`. */
export function styledSpan(
	name: string,
	base: string,
): (props?: StyledProps) => TemplateResult {
	return component<StyledProps>(
		(props) =>
			html`<span
				data-slot="${name}"
				id="${props.id}"
				class="${() => cn(base, read(props.class))}"
			>${slot(props.children)}</span>`,
	);
}
