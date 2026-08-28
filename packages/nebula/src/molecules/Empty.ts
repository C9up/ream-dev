/**
 * Empty — the placeholder for a list, table or panel with nothing in it.
 *
 * Worth having as a component rather than ad-hoc markup, because an empty
 * state is where an app most often falls back to a bare "No results" and
 * leaves the user without a next step. The parts push towards the useful
 * shape: an icon, a title, a sentence of explanation, and something to do
 * about it.
 */

import { styledDiv } from "../lib/styled.js";

export type { StyledProps as EmptyProps } from "../lib/styled.js";

export const Empty = styledDiv(
	"empty",
	"flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
);

export const EmptyHeader = styledDiv(
	"empty-header",
	"flex max-w-sm flex-col items-center gap-2 text-center",
);

export const EmptyMedia = styledDiv(
	"empty-media",
	"bg-muted text-muted-foreground mb-2 flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-5",
);

export const EmptyTitle = styledDiv(
	"empty-title",
	"text-lg font-medium tracking-tight",
);

export const EmptyDescription = styledDiv(
	"empty-description",
	"text-muted-foreground text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
);

export const EmptyContent = styledDiv(
	"empty-content",
	"flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
);
