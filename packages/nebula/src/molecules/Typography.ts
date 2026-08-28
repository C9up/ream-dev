/**
 * Typography — prose styles for content nebula does not otherwise own.
 *
 * shadcn documents these as copy-paste snippets rather than shipping them as
 * components, which leaves every app to re-derive the same scale. They are
 * cheap to ship and they are what keeps a marketing page, a changelog and an
 * empty state reading as one product.
 *
 * `text-balance` on headings and `text-pretty` on body copy do the work here:
 * they stop a two-word orphan on the last line of a heading and a single word
 * ending a paragraph, which is most of what separates typeset text from text.
 */

import { component, html } from "@c9up/aurora";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { read } from "../lib/props.js";
import { type StyledProps, styledDiv } from "../lib/styled.js";

export type TypographyProps = StyledProps;

export const H1 = component<TypographyProps>((props) => {
	return html`<h1
		id="${props.id}"
		class="${() =>
			cn(
				"scroll-m-20 text-4xl font-extrabold tracking-tight text-balance",
				read(props.class),
			)}"
	>${slot(props.children)}</h1>`;
});

export const H2 = component<TypographyProps>((props) => {
	return html`<h2
		id="${props.id}"
		class="${() =>
			cn(
				"scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
				read(props.class),
			)}"
	>${slot(props.children)}</h2>`;
});

export const H3 = component<TypographyProps>((props) => {
	return html`<h3
		id="${props.id}"
		class="${() => cn("scroll-m-20 text-2xl font-semibold tracking-tight", read(props.class))}"
	>${slot(props.children)}</h3>`;
});

export const H4 = component<TypographyProps>((props) => {
	return html`<h4
		id="${props.id}"
		class="${() => cn("scroll-m-20 text-xl font-semibold tracking-tight", read(props.class))}"
	>${slot(props.children)}</h4>`;
});

export const P = component<TypographyProps>((props) => {
	return html`<p
		id="${props.id}"
		class="${() => cn("leading-7 text-pretty [&:not(:first-child)]:mt-6", read(props.class))}"
	>${slot(props.children)}</p>`;
});

export const Blockquote = component<TypographyProps>((props) => {
	return html`<blockquote
		id="${props.id}"
		class="${() => cn("mt-6 border-l-2 pl-6 italic", read(props.class))}"
	>${slot(props.children)}</blockquote>`;
});

export const InlineCode = component<TypographyProps>((props) => {
	return html`<code
		class="${() =>
			cn(
				"bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
				read(props.class),
			)}"
	>${slot(props.children)}</code>`;
});

export const List = component<TypographyProps>((props) => {
	return html`<ul
		class="${() => cn("my-6 ml-6 list-disc [&>li]:mt-2", read(props.class))}"
	>${slot(props.children)}</ul>`;
});

export const Lead = styledDiv(
	"lead",
	"text-muted-foreground text-xl text-pretty",
);
export const Large = styledDiv("large", "text-lg font-semibold");
export const Small = styledDiv("small", "text-sm leading-none font-medium");
export const Muted = styledDiv("muted", "text-muted-foreground text-sm");
