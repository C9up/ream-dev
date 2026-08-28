/**
 * Skeleton — a placeholder block while content loads.
 *
 * `aria-hidden` and no live region on purpose. A pulsing grey box carries no
 * information, and announcing one per row of a loading table is worse than
 * silence. The surrounding region should carry `aria-busy` instead, which says
 * the same thing once.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface SkeletonProps {
	class?: Reactive<string>;
}

export const Skeleton = component<SkeletonProps>((props) => {
	return html`<div
		data-slot="skeleton"
		aria-hidden="true"
		class="${() => cn("bg-accent animate-pulse rounded-md", read(props.class))}"
	></div>`;
});
