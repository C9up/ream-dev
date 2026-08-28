/**
 * Pagination — page links for a long list.
 *
 * The interesting part is `pageWindow`, which decides which page numbers to
 * show. Rendering all of them breaks at a few hundred pages; the usual fix is
 * a fixed window around the current page, which then jitters in width as you
 * approach either end — the control visibly reflows while you click through
 * it. `pageWindow` keeps the count constant instead, so the row stays the same
 * size from page 1 to page 500.
 *
 * `aria-current="page"` marks the current page. Without it the only signal is
 * the highlight, which a screen-reader user does not get.
 */

import { component, html } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MoreHorizontalIcon,
} from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

export interface PaginationProps {
	page: Reactive<number>;
	pageCount: Reactive<number>;
	/** How many numbered links to show, ellipses included. Default `7`. */
	window?: number;
	/** Build an href per page. Omit for a button-driven pagination. */
	href?: (page: number) => string;
	onPageChange?: (page: number) => void;
	class?: Reactive<string>;
}

/** `null` marks a gap that renders as an ellipsis. */
export type PageSlot = number | null;

/**
 * Which page numbers to show, at a fixed total width.
 *
 * Always the first page, the last page, a run around the current one, and one
 * or two gaps — adding up to exactly `size` slots wherever the current page
 * sits. The constant width is the whole reason this is computed rather than a
 * range being sliced: a window that simply narrows near the ends makes the
 * control reflow as you click through it, and the buttons move under the
 * pointer.
 *
 * Near an end there is only one gap, so the run is one slot wider to make up
 * for it. That is the case a naive implementation gets wrong.
 */
export function pageWindow(
	page: number,
	pageCount: number,
	size = 7,
): readonly PageSlot[] {
	if (pageCount <= size) return range(1, pageCount);

	// Below five slots there is no room for first, last, a gap and a run, so
	// the shape this function promises cannot be built.
	const slots = Math.max(size, 5);
	const current = Math.min(Math.max(page, 1), pageCount);

	// Near an end the run absorbs the first (or last) page and there is a
	// single gap, so it holds `slots - 2` entries. In the middle the first and
	// last pages are separate and there are two gaps, leaving `slots - 4`.
	const runNearEnd = slots - 2;
	const runInMiddle = slots - 4;

	if (current <= runNearEnd - 1) {
		return [...range(1, runNearEnd), null, pageCount];
	}
	if (current >= pageCount - runNearEnd + 2) {
		return [1, null, ...range(pageCount - runNearEnd + 1, pageCount)];
	}

	const before = Math.floor((runInMiddle - 1) / 2);
	const start = current - before;
	return [1, null, ...range(start, start + runInMiddle - 1), null, pageCount];
}

function range(from: number, to: number): number[] {
	const out: number[] = [];
	for (let value = from; value <= to; value += 1) out.push(value);
	return out;
}

export const Pagination = component<PaginationProps>((props) => {
	const page = (): number => read(props.page) ?? 1;
	const pageCount = (): number => Math.max(1, read(props.pageCount) ?? 1);

	const go = (target: number) => (event: MouseEvent) => {
		if (props.onPageChange === undefined) return;
		// Only intercept when the caller wants callback-driven paging. With an
		// `href` and no handler the link must navigate normally.
		event.preventDefault();
		props.onPageChange(Math.min(Math.max(target, 1), pageCount()));
	};

	return html`<nav
		data-slot="pagination"
		role="navigation"
		aria-label="pagination"
		class="${() => cn("mx-auto flex w-full justify-center", read(props.class))}"
	>
		<ul data-slot="pagination-content" class="flex flex-row items-center gap-1">
			<li>
				${link({
					label: html`${ChevronLeftIcon({ class: "size-4" })}<span class="hidden sm:block">Previous</span>`,
					ariaLabel: "Go to previous page",
					href: props.href?.(page() - 1),
					disabled: () => page() <= 1,
					onClick: go(page() - 1),
					size: "default",
					extra: "gap-1 px-2.5 sm:pl-2.5",
				})}
			</li>
			${() =>
				pageWindow(page(), pageCount(), props.window ?? 7).map(
					(entry, index) =>
						entry === null
							? html`<li aria-hidden="true">
								<span class="flex size-9 items-center justify-center">
									${MoreHorizontalIcon({ class: "size-4" })}
									<span class="sr-only">More pages</span>
								</span>
							</li>`
							: html`<li>
								${link({
									label: String(entry),
									ariaLabel: `Go to page ${entry}`,
									href: props.href?.(entry),
									current: entry === page(),
									onClick: go(entry),
									size: "icon",
									key: index,
								})}
							</li>`,
				)}
			<li>
				${link({
					label: html`<span class="hidden sm:block">Next</span>${ChevronRightIcon({ class: "size-4" })}`,
					ariaLabel: "Go to next page",
					href: props.href?.(page() + 1),
					disabled: () => page() >= pageCount(),
					onClick: go(page() + 1),
					size: "default",
					extra: "gap-1 px-2.5 sm:pr-2.5",
				})}
			</li>
		</ul>
	</nav>`;
});

interface LinkSpec {
	label: Child;
	ariaLabel: string;
	href?: string;
	current?: boolean;
	disabled?: () => boolean;
	onClick: (event: MouseEvent) => void;
	size: "default" | "icon";
	extra?: string;
	key?: number;
}

/**
 * One page link.
 *
 * Always an `<a>`, even without an `href`: pagination is navigation, and the
 * role is what a screen reader uses to offer "list of links" here. The
 * disabled ends carry `aria-disabled` plus `pointer-events-none` rather than
 * being removed, so the control keeps its width at both ends of the range.
 */
function link(spec: LinkSpec): Child {
	const disabled = (): boolean => spec.disabled?.() === true;

	return html`<a
		data-slot="pagination-link"
		href="${spec.href}"
		aria-label="${spec.ariaLabel}"
		aria-current="${spec.current === true ? "page" : undefined}"
		aria-disabled="${() => (disabled() ? "true" : undefined)}"
		tabindex="${() => (disabled() ? -1 : 0)}"
		class="${() =>
			cn(
				buttonVariants({
					variant: spec.current === true ? "outline" : "ghost",
					size: spec.size,
				}),
				spec.extra,
				disabled() ? "pointer-events-none opacity-50" : "",
			)}"
		@click="${spec.onClick}"
	>${spec.label}</a>`;
}
