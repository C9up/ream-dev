/**
 * Separator — a rule between sections.
 *
 * `role="separator"` with an orientation, or `role="none"` when decorative.
 * The distinction matters to screen readers: a separator is announced as a
 * structural boundary, and a purely visual line between two buttons in a
 * toolbar should not be. Decorative is the default, matching Radix.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface SeparatorProps {
	orientation?: Reactive<"horizontal" | "vertical">;
	/** `false` exposes it to assistive technology as a real boundary. */
	decorative?: Reactive<boolean>;
	class?: Reactive<string>;
}

export const Separator = component<SeparatorProps>((props) => {
	const orientation = (): "horizontal" | "vertical" =>
		readOr(props.orientation, "horizontal");

	return html`<div
		data-slot="separator"
		data-orientation="${orientation}"
		role="${() => (readOr(props.decorative, true) ? "none" : "separator")}"
		aria-orientation="${() => (readOr(props.decorative, true) ? undefined : orientation())}"
		class="${() =>
			cn(
				"bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
				read(props.class),
			)}"
	></div>`;
});
