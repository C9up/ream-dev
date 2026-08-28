/**
 * Carousel — a horizontally scrolling strip of slides.
 *
 * shadcn wraps `embla-carousel`, which animates a transform with its own
 * requestAnimationFrame loop and reimplements drag physics on top. nebula uses
 * CSS scroll-snap and `scrollBy`.
 *
 * That is not only smaller, it is better behaved. Native scrolling brings
 * touch momentum, trackpad gestures, the platform's own overscroll, and
 * keyboard scrolling — all things a transform-based carousel has to rebuild
 * and usually gets partly wrong. `scroll-behavior: smooth` handles the
 * animation, and `prefers-reduced-motion` turns it off without a branch here.
 *
 * The strip is a `region` with `aria-roledescription="carousel"`, and slides
 * are `group`s labelled "N of M". A screen reader user otherwise has no way to
 * tell how much is off-screen — the visual affordance of a strip running off
 * the edge carries none of that.
 */

import { component, html, onMount, onUnmount, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ArrowLeftIcon, ArrowRightIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface CarouselProps {
	slides: readonly Child[];
	/** Announced before the slides. */
	label?: string;
	orientation?: "horizontal" | "vertical";
	class?: Reactive<string>;
	slideClass?: Reactive<string>;
}

export const Carousel = component<CarouselProps>((props) => {
	const trackId = uid("carousel-track");
	const horizontal = props.orientation !== "vertical";
	const atStart = signal(true);
	const atEnd = signal(false);

	function track(): HTMLElement | null {
		return document.getElementById(trackId);
	}

	/**
	 * Recompute whether either end is reached.
	 *
	 * The one-pixel tolerance is load-bearing: with fractional device pixel
	 * ratios, `scrollLeft` at the far end lands a fraction short of
	 * `scrollWidth - clientWidth`, and an exact comparison leaves the "next"
	 * button enabled on a carousel that cannot scroll any further.
	 */
	function syncEdges(): void {
		const element = track();
		if (element === null) return;
		const position = horizontal ? element.scrollLeft : element.scrollTop;
		const total = horizontal ? element.scrollWidth : element.scrollHeight;
		const visible = horizontal ? element.clientWidth : element.clientHeight;
		atStart(position <= 1);
		atEnd(position + visible >= total - 1);
	}

	function scrollByPage(direction: 1 | -1): void {
		const element = track();
		if (element === null) return;
		const distance =
			(horizontal ? element.clientWidth : element.clientHeight) * direction;
		element.scrollBy(
			horizontal
				? { left: distance, behavior: "smooth" }
				: { top: distance, behavior: "smooth" },
		);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const back = horizontal ? "ArrowLeft" : "ArrowUp";
		const forward = horizontal ? "ArrowRight" : "ArrowDown";
		if (event.key === back) {
			event.preventDefault();
			scrollByPage(-1);
		} else if (event.key === forward) {
			event.preventDefault();
			scrollByPage(1);
		}
	}

	onMount(() => {
		syncEdges();
		const element = track();
		element?.addEventListener("scroll", syncEdges, { passive: true });
		window.addEventListener("resize", syncEdges);
	});

	onUnmount(() => {
		track()?.removeEventListener("scroll", syncEdges);
		window.removeEventListener("resize", syncEdges);
	});

	const count = props.slides.length;

	return html`<div
		data-slot="carousel"
		role="region"
		aria-roledescription="carousel"
		aria-label="${props.label ?? "Carousel"}"
		class="${() => cn("relative", read(props.class))}"
		@keydown="${onKeyDown}"
	>
		<div
			data-slot="carousel-track"
			id="${trackId}"
			tabindex="0"
			class="${cn(
				"flex snap-mandatory gap-4 overflow-auto scroll-smooth outline-none motion-reduce:scroll-auto",
				horizontal
					? "snap-x flex-row [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					: "snap-y max-h-96 flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}"
		>
			${props.slides.map(
				(child, index) => html`<div
					data-slot="carousel-slide"
					role="group"
					aria-roledescription="slide"
					aria-label="${`${index + 1} of ${count}`}"
					class="${() => cn("min-w-0 shrink-0 grow-0 basis-full snap-start", read(props.slideClass))}"
				>${child}</div>`,
			)}
		</div>
		<button
			type="button"
			data-slot="carousel-previous"
			aria-label="Previous slide"
			?disabled="${() => atStart()}"
			class="${cn(
				buttonVariants({ variant: "outline", size: "icon" }),
				"absolute size-8 rounded-full",
				horizontal
					? "top-1/2 -left-12 -translate-y-1/2"
					: "-top-12 left-1/2 -translate-x-1/2 rotate-90",
			)}"
			@click="${() => scrollByPage(-1)}"
		>${ArrowLeftIcon({ class: "size-4" })}</button>
		<button
			type="button"
			data-slot="carousel-next"
			aria-label="Next slide"
			?disabled="${() => atEnd()}"
			class="${cn(
				buttonVariants({ variant: "outline", size: "icon" }),
				"absolute size-8 rounded-full",
				horizontal
					? "top-1/2 -right-12 -translate-y-1/2"
					: "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
			)}"
			@click="${() => scrollByPage(1)}"
		>${ArrowRightIcon({ class: "size-4" })}</button>
	</div>`;
});
