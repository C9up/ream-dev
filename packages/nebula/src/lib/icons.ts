/**
 * Inline icons.
 *
 * shadcn/ui pulls every glyph from `lucide-react`. nebula cannot: it is a
 * React package, and taking a dependency for fifteen paths would undo the
 * point of writing `cn` and `cva` by hand.
 *
 * So the glyphs the component set actually needs are inlined here, traced from
 * Lucide's own 24×24 grid so they sit correctly next to Lucide icons in an app
 * that also uses the real thing. Nothing else is added — this is not an icon
 * library, and an app wanting a hundred more should install one and pass the
 * markup in as content.
 *
 * `currentColor` throughout and no hardcoded size: an icon inherits the text
 * colour of whatever it sits in, and the `[&_svg]:size-4` rules on Button and
 * friends set the size from the component. That is what lets the same icon
 * work in a button, a menu item and a badge without a variant each.
 */

import { html, type TemplateResult } from "@c9up/aurora";

export interface IconProps {
	class?: string;
	/** Icons are decorative by default; give a label to expose one to a reader. */
	label?: string;
}

/**
 * Wrap path data in a Lucide-shaped `<svg>`.
 *
 * `aria-hidden` unless labelled, because an icon beside its own text label is
 * noise to a screen reader — it reads the glyph's name and then the text. The
 * exceptions are icon-only controls, which pass a label.
 */
function svg(body: TemplateResult, props: IconProps = {}): TemplateResult {
	return html`<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="${props.class}"
		aria-hidden="${props.label === undefined ? "true" : undefined}"
		aria-label="${props.label}"
		role="${props.label === undefined ? undefined : "img"}"
	>${body}</svg>`;
}

export const CheckIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="M20 6 9 17l-5-5" />`, props);

export const MinusIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="M5 12h14" />`, props);

export const XIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="M18 6 6 18" /><path d="m6 6 12 12" />`, props);

export const ChevronDownIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m6 9 6 6 6-6" />`, props);

export const ChevronUpIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m18 15-6-6-6 6" />`, props);

export const ChevronLeftIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m15 18-6-6 6-6" />`, props);

export const ChevronRightIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m9 18 6-6-6-6" />`, props);

export const ChevronsUpDownIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />`, props);

export const SearchIcon = (props?: IconProps): TemplateResult =>
	svg(html`<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />`, props);

export const CircleIcon = (props?: IconProps): TemplateResult =>
	svg(html`<circle cx="12" cy="12" r="10" />`, props);

/** Filled dot — the selected marker inside a radio. */
export const DotIcon = (props?: IconProps): TemplateResult =>
	svg(
		html`<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`,
		props,
	);

export const MoreHorizontalIcon = (props?: IconProps): TemplateResult =>
	svg(
		html`<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle
				cx="5"
				cy="12"
				r="1"
			/>`,
		props,
	);

export const ArrowLeftIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />`, props);

export const ArrowRightIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />`, props);

export const CalendarIcon = (props?: IconProps): TemplateResult =>
	svg(
		html`<path d="M8 2v4" /><path d="M16 2v4" /><rect
				width="18"
				height="18"
				x="3"
				y="4"
				rx="2"
			/><path d="M3 10h18" />`,
		props,
	);

export const PanelLeftIcon = (props?: IconProps): TemplateResult =>
	svg(
		html`<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />`,
		props,
	);

export const GripVerticalIcon = (props?: IconProps): TemplateResult =>
	svg(
		html`<circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle
				cx="9"
				cy="19"
				r="1"
			/><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle
				cx="15"
				cy="19"
				r="1"
			/>`,
		props,
	);

/** The arc Lucide uses for `loader-circle`; spun by the Spinner's animation. */
export const LoaderIcon = (props?: IconProps): TemplateResult =>
	svg(html`<path d="M21 12a9 9 0 1 1-6.219-8.56" />`, props);
