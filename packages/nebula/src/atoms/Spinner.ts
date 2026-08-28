/**
 * Spinner — an indeterminate activity indicator.
 *
 * `role="status"` with a visually hidden label, so a screen reader announces
 * that something is loading. A bare spinning glyph is invisible to a reader
 * and the user is left with silence where a sighted user sees motion.
 *
 * `motion-reduce:animate-none` stops the rotation for users who asked the
 * system to reduce motion. The glyph stays, so the indicator does not vanish.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { LoaderIcon } from "../lib/icons.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface SpinnerProps {
	/** Announced to assistive technology. Defaults to `"Loading"`. */
	label?: Reactive<string>;
	class?: Reactive<string>;
}

export const Spinner = component<SpinnerProps>((props) => {
	return html`<span data-slot="spinner" role="status" class="inline-flex">
		${LoaderIcon({ class: cn("size-4 animate-spin motion-reduce:animate-none", read(props.class)) })}
		<span class="sr-only">${() => readOr(props.label, "Loading")}</span>
	</span>`;
});
