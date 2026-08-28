/**
 * Card — a bordered surface holding one unit of content.
 *
 * Seven parts, all presentational. The only one worth explaining is
 * `CardAction`: it is grid-positioned into the header's second column so a
 * button or menu trigger sits opposite the title without the header needing a
 * flex wrapper and a spacer. The header switches to two columns only when an
 * action is present, via `has-data-[slot=card-action]`.
 */

import { styledDiv } from "../lib/styled.js";

export type { StyledProps as CardProps } from "../lib/styled.js";

export const Card = styledDiv(
	"card",
	"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
);

export const CardHeader = styledDiv(
	"card-header",
	"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
);

export const CardTitle = styledDiv("card-title", "leading-none font-semibold");

export const CardDescription = styledDiv(
	"card-description",
	"text-muted-foreground text-sm",
);

export const CardAction = styledDiv(
	"card-action",
	"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
);

export const CardContent = styledDiv("card-content", "px-6");

export const CardFooter = styledDiv(
	"card-footer",
	"flex items-center px-6 [.border-t]:pt-6",
);
