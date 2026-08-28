/// <reference lib="dom" />
/**
 * Presence — keep a node mounted until its exit animation has finished.
 *
 * Closing an overlay by removing it from the DOM cancels any exit animation:
 * the node is gone before the first frame plays. Radix solves this with a
 * `Presence` wrapper, and shadcn's markup depends on it — the `data-[state=
 * closed]:animate-out` utilities on every overlay assume something is holding
 * the node on screen while that animation runs.
 *
 * `presence()` owns a `state` signal that leads the DOM: it flips to `closed`
 * immediately so the exit animation can start, and only reports `mounted`
 * false once the animation ends. A surface with no animation unmounts on the
 * next tick, so the abstraction costs nothing when unused.
 */

import { type ReadSignal, signal } from "@c9up/aurora";

export type PresenceState = "open" | "closed";

export interface Presence {
	/** Should the node be in the DOM right now? */
	readonly mounted: ReadSignal<boolean>;
	/** The value for `data-state` — drives the enter/exit utility classes. */
	readonly state: ReadSignal<PresenceState>;
	/** Show the node. Cancels a pending unmount. */
	open(): void;
	/** Start the exit animation. Unmount follows when it finishes. */
	close(): void;
	/**
	 * Hand over the element once it is live. Presence watches it for the end of
	 * the exit animation; until it is given one, close() unmounts immediately.
	 */
	attach(element: HTMLElement | null): void;
	/** Drop listeners and timers. */
	dispose(): void;
}

export function presence(initiallyOpen = false): Presence {
	const mounted = signal(initiallyOpen);
	const state = signal<PresenceState>(initiallyOpen ? "open" : "closed");

	let element: HTMLElement | null = null;
	let pendingUnmount = false;

	function finishClose(): void {
		if (!pendingUnmount) return;
		pendingUnmount = false;
		mounted(false);
	}

	/**
	 * The animation is only ours if it played on the surface itself.
	 *
	 * Events bubble, so a child's animation would otherwise unmount the parent
	 * mid-flight — a spinner inside a closing dialog is enough to trigger it.
	 */
	function onAnimationEnd(event: AnimationEvent | TransitionEvent): void {
		if (event.target !== element) return;
		finishClose();
	}

	function detach(): void {
		if (element === null) return;
		element.removeEventListener("animationend", onAnimationEnd);
		element.removeEventListener("animationcancel", onAnimationEnd);
		element.removeEventListener("transitionend", onAnimationEnd);
		element.removeEventListener("transitioncancel", onAnimationEnd);
		element = null;
	}

	return {
		mounted,
		state,

		open(): void {
			pendingUnmount = false;
			mounted(true);
			state("open");
		},

		close(): void {
			if (!mounted()) return;
			state("closed");

			// No element yet means nothing can be animating — unmount now rather
			// than waiting for an event that will never arrive.
			if (element === null) {
				mounted(false);
				return;
			}

			pendingUnmount = true;
			if (!isAnimating(element)) finishClose();
		},

		attach(next: HTMLElement | null): void {
			detach();
			element = next;
			if (element === null) return;
			element.addEventListener("animationend", onAnimationEnd);
			element.addEventListener("animationcancel", onAnimationEnd);
			element.addEventListener("transitionend", onAnimationEnd);
			element.addEventListener("transitioncancel", onAnimationEnd);
		},

		dispose(): void {
			pendingUnmount = false;
			detach();
		},
	};
}

/**
 * Run `done` once the element's exit animation finishes, or immediately when
 * there is none. Returns a cancel function.
 *
 * The portalled surfaces do not use `presence()` — they own their own mounting
 * through `portal()`, so a second `mounted` signal would just be a shadow of
 * the portal's own lifetime. What they do need is this: the answer to "may I
 * remove the node yet". Call it *after* flipping `data-state` to `closed`, so
 * the computed style already reflects the closing rules.
 */
export function onExitFinished(
	element: HTMLElement,
	done: () => void,
): () => void {
	if (!isAnimating(element)) {
		done();
		return () => {};
	}

	function finish(event: AnimationEvent | TransitionEvent): void {
		// Bubbled events from children would cut the parent's exit short.
		if (event.target !== element) return;
		cancel();
		done();
	}

	function cancel(): void {
		element.removeEventListener("animationend", finish);
		element.removeEventListener("animationcancel", finish);
		element.removeEventListener("transitionend", finish);
		element.removeEventListener("transitioncancel", finish);
	}

	element.addEventListener("animationend", finish);
	element.addEventListener("animationcancel", finish);
	element.addEventListener("transitionend", finish);
	element.addEventListener("transitioncancel", finish);
	return cancel;
}

/**
 * Is an exit animation actually running?
 *
 * Read after `data-state` has flipped, so the computed style already reflects
 * the closing rules. `animationName: none` and a zero transition duration both
 * mean there is nothing to wait for, and waiting anyway would strand the node
 * in the DOM forever — the failure mode this check exists to prevent.
 */
function isAnimating(element: HTMLElement): boolean {
	if (typeof getComputedStyle !== "function") return false;

	const style = getComputedStyle(element);
	const hasAnimation =
		style.animationName !== "" && style.animationName !== "none";
	if (hasAnimation) return true;

	return parseDuration(style.transitionDuration) > 0;
}

/** Longest duration in a comma-separated CSS time list, in milliseconds. */
function parseDuration(value: string): number {
	let longest = 0;
	for (const part of value.split(",")) {
		const trimmed = part.trim();
		if (trimmed === "") continue;
		const numeric = Number.parseFloat(trimmed);
		if (Number.isNaN(numeric)) continue;
		const ms = trimmed.endsWith("ms") ? numeric : numeric * 1000;
		if (ms > longest) longest = ms;
	}
	return longest;
}
