/**
 * Stable element ids.
 *
 * Radix leans on React's `useId` to wire ARIA relationships — a trigger's
 * `aria-controls` has to name the id its content actually carries. Aurora has
 * no equivalent, and nebula needs one for two reasons: the ARIA wiring above,
 * and element lookup. Aurora templates have no `ref` directive, so a component
 * that must measure or focus a node finds it by id inside `onMount()`.
 *
 * The counter is monotonic per module instance, so the sequence depends only
 * on the order components are constructed in. That order is identical on the
 * server and in the browser for the same tree, which is what makes the ids
 * survive hydration — the same property React's `useId` relies on.
 *
 * `resetIds()` exists for the server: a long-lived process renders many
 * requests, and without a reset the counter climbs forever and every response
 * ships different markup, defeating any HTML cache. Call it once per render
 * pass, before the tree is built.
 */

let counter = 0;

/** Mint an id unique within this render pass. */
export function uid(prefix = "nebula"): string {
	counter += 1;
	return `${prefix}-${counter}`;
}

/** Restart the sequence. Call once per SSR render, before building the tree. */
export function resetIds(): void {
	counter = 0;
}

/**
 * Look an element up by the id a component minted for it.
 *
 * Returns `null` off the DOM (SSR) or before mount rather than throwing, so
 * callers can run the same code in both environments. Every consumer inside
 * nebula is in `onMount`, where the node is live.
 */
export function byId(id: string): HTMLElement | null {
	if (typeof document === "undefined") return null;
	return document.getElementById(id);
}
