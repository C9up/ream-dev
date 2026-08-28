/**
 * AspectRatio — hold a box at a fixed width-to-height ratio.
 *
 * Radix's version predates the CSS `aspect-ratio` property and reproduces it
 * with a padding-top percentage trick. That is no longer needed anywhere
 * nebula runs, so this is the property, set inline because the value is
 * arbitrary and cannot be a utility class.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface AspectRatioProps {
	children?: Slot;
	/** Width divided by height. `16 / 9` for widescreen, `1` for a square. */
	ratio?: Reactive<number>;
	class?: Reactive<string>;
}

export const AspectRatio = component<AspectRatioProps>((props) => {
	return html`<div
		data-slot="aspect-ratio"
		style="${() => `aspect-ratio: ${readOr(props.ratio, 1)}`}"
		class="${() => cn("relative w-full", read(props.class))}"
	>${slot(props.children)}</div>`;
});
