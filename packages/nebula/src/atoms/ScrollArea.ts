/**
 * ScrollArea — a scroll container with a restrained scrollbar.
 *
 * A deliberate departure from Radix, which hides the native scrollbar and
 * draws its own out of divs, driven by scroll and resize listeners. That buys
 * pixel-identical scrollbars across platforms; it costs a virtualised
 * scrollbar that has to re-derive thumb size and position on every frame, and
 * that drops momentum scrolling on touch.
 *
 * The trade is not worth it here. `scrollbar-width` and `scrollbar-color` are
 * supported everywhere nebula targets, the WebKit pseudo-elements cover the
 * rest, and the result keeps native scrolling — including overscroll, momentum
 * and the platform's own accessibility behaviour — for a handful of classes
 * and no JavaScript.
 *
 * Apps needing a fully custom scrollbar should reach for a dedicated library;
 * this component would be the wrong place to grow one.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export const scrollAreaClasses = cn(
	"relative overflow-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
	"[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar]:h-2.5",
	"[&::-webkit-scrollbar-track]:bg-transparent",
	"[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:bg-clip-content",
	"hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40",
);

export interface ScrollAreaProps {
	children?: Slot;
	/** Which axis may scroll. Default `"vertical"`. */
	orientation?: Reactive<"vertical" | "horizontal" | "both">;
	class?: Reactive<string>;
}

export const ScrollArea = component<ScrollAreaProps>((props) => {
	const axisClass = (): string => {
		const orientation = readOr(props.orientation, "vertical");
		if (orientation === "horizontal")
			return "overflow-x-auto overflow-y-hidden";
		if (orientation === "both") return "overflow-auto";
		return "overflow-y-auto overflow-x-hidden";
	};

	return html`<div
		data-slot="scroll-area"
		class="${() => cn(scrollAreaClasses, axisClass(), read(props.class))}"
	>${slot(props.children)}</div>`;
});
