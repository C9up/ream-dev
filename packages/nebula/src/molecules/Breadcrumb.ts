/**
 * Breadcrumb — the trail back up the hierarchy.
 *
 * `aria-label="breadcrumb"` on the `<nav>` and `aria-current="page"` on the
 * last entry. Both matter: the label is how a screen reader distinguishes this
 * navigation from the other landmarks on the page, and `aria-current` is what
 * tells the user which crumb is where they are — the visual weight change does
 * not carry that.
 *
 * The separators are `aria-hidden` and marked `role="presentation"`. Read
 * aloud, a chevron between every crumb is noise; the list structure already
 * conveys the sequence.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronRightIcon, MoreHorizontalIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

export interface Crumb {
	label: Child;
	/** Absent on the current page, and on a collapsed ellipsis. */
	href?: string;
	/** Renders an ellipsis standing in for hidden ancestors. */
	ellipsis?: boolean;
}

export interface BreadcrumbProps {
	items: readonly Crumb[];
	/** Replaces the chevron between entries. */
	separator?: Child;
	class?: Reactive<string>;
}

export const Breadcrumb = component<BreadcrumbProps>((props) => {
	return html`<nav
		data-slot="breadcrumb"
		aria-label="breadcrumb"
		class="${() => cn(read(props.class))}"
	>
		<ol
			data-slot="breadcrumb-list"
			class="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5"
		>
			${props.items.map((item, index) =>
				renderCrumb(
					item,
					index === props.items.length - 1,
					index > 0,
					props.separator,
				),
			)}
		</ol>
	</nav>`;
});

function renderCrumb(
	item: Crumb,
	isLast: boolean,
	needsSeparator: boolean,
	separator: Child,
): Child {
	return [
		needsSeparator
			? html`<li
					data-slot="breadcrumb-separator"
					role="presentation"
					aria-hidden="true"
					class="[&>svg]:size-3.5"
				>${separator ?? ChevronRightIcon()}</li>`
			: null,
		html`<li data-slot="breadcrumb-item" class="inline-flex items-center gap-1.5">
			${renderCrumbBody(item, isLast)}
		</li>`,
	];
}

function renderCrumbBody(item: Crumb, isLast: boolean): Child {
	if (item.ellipsis === true) {
		return html`<span
			data-slot="breadcrumb-ellipsis"
			role="presentation"
			aria-hidden="true"
			class="flex size-9 items-center justify-center"
		>
			${MoreHorizontalIcon({ class: "size-4" })}
			<span class="sr-only">More</span>
		</span>`;
	}

	if (isLast || item.href === undefined) {
		return html`<span
			data-slot="breadcrumb-page"
			role="link"
			aria-disabled="true"
			aria-current="page"
			class="text-foreground font-normal"
		>${item.label}</span>`;
	}

	return html`<a
		data-slot="breadcrumb-link"
		href="${item.href}"
		class="hover:text-foreground transition-colors"
	>${item.label}</a>`;
}
