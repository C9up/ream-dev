/**
 * Enter and exit animations for overlays.
 *
 * shadcn drives these with `animate-in` / `animate-out` from `tw-animate-css`
 * — a Tailwind plugin, and a dependency. nebula declares the four keyframes it
 * needs in `theme.css` and references them through arbitrary animation values,
 * which every one of the three adapters supports and none of them needs a
 * plugin for.
 *
 * The durations are asymmetric on purpose: entering is slower than leaving.
 * A surface appearing wants to be noticed, a surface dismissed wants to be out
 * of the way — matching them makes closing feel sluggish.
 *
 * Every string ends in `motion-reduce:animate-none`. That is not only a
 * courtesy: `onExitFinished` reads the computed style to decide whether to
 * wait, sees no animation, and removes the node immediately. Reduced motion
 * therefore gets an instant close rather than a delayed one, with no branch in
 * the component.
 */

import type { Side } from "../primitives/floating.js";

/** Popovers, menus, selects — scale up from the anchor. */
export const zoomInOut =
	"data-[state=open]:animate-[nebula-zoom-in_150ms_ease-out] data-[state=closed]:animate-[nebula-zoom-out_120ms_ease-in] motion-reduce:animate-none";

/** Backdrops and tooltips — no movement, just opacity. */
export const fadeInOut =
	"data-[state=open]:animate-[nebula-fade-in_150ms_ease-out] data-[state=closed]:animate-[nebula-fade-out_120ms_ease-in] motion-reduce:animate-none";

/**
 * Panels that slide in from an edge — Sheet, Drawer.
 *
 * The transform is a utility pair rather than a keyframe, because the distance
 * depends on the panel's own size and only `translate-x-full` knows that.
 */
export function slideFrom(side: Side): string {
	const axis =
		side === "left"
			? "data-[state=closed]:-translate-x-full"
			: side === "right"
				? "data-[state=closed]:translate-x-full"
				: side === "top"
					? "data-[state=closed]:-translate-y-full"
					: "data-[state=closed]:translate-y-full";

	return `transition-transform duration-300 ease-in-out data-[state=open]:translate-x-0 data-[state=open]:translate-y-0 ${axis} motion-reduce:transition-none`;
}
