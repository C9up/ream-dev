/// <reference lib="dom" />
/**
 * Body scroll lock — stop the page scrolling behind a modal surface.
 *
 * Two details separate a working lock from the naive `overflow: hidden`:
 *
 * 1. **Reference counting.** Two modals can be open at once (a confirm dialog
 *    over a sheet). The second lock must not re-read the "original" overflow,
 *    which is by then already `hidden`, and the first release must not unlock
 *    while the second is still up.
 * 2. **Scrollbar compensation.** Hiding overflow removes the scrollbar, the
 *    viewport widens by its width, and the whole page jumps sideways as the
 *    modal opens. Padding the body by exactly that width holds it still.
 *
 * The saved styles are the *inline* ones, not the computed ones. Restoring a
 * computed value would write a hardcoded padding onto a body that had none,
 * and the layout would stay shifted after the last modal closed.
 */

let depth = 0;
let savedOverflow = "";
let savedPaddingRight = "";

/** Lock page scrolling. Returns the matching unlock; safe to call twice. */
export function lockScroll(): () => void {
	if (typeof document === "undefined") return () => {};

	depth += 1;
	if (depth === 1) applyLock();

	let released = false;
	return (): void => {
		if (released) return;
		released = true;
		depth -= 1;
		if (depth === 0) removeLock();
	};
}

/** Is the page currently locked? Exposed for tests. */
export function isScrollLocked(): boolean {
	return depth > 0;
}

function applyLock(): void {
	const body = document.body;
	savedOverflow = body.style.overflow;
	savedPaddingRight = body.style.paddingRight;

	const gap = scrollbarWidth();
	if (gap > 0) {
		// Add to whatever padding the body already has rather than replacing it.
		const existing = Number.parseFloat(getComputedStyle(body).paddingRight);
		const base = Number.isNaN(existing) ? 0 : existing;
		body.style.paddingRight = `${base + gap}px`;
	}
	body.style.overflow = "hidden";
}

function removeLock(): void {
	const body = document.body;
	body.style.overflow = savedOverflow;
	body.style.paddingRight = savedPaddingRight;
	savedOverflow = "";
	savedPaddingRight = "";
}

/**
 * Width of the vertical scrollbar, or 0 when it overlays the content.
 *
 * `innerWidth - documentElement.clientWidth` measures the real gutter, which
 * is 0 on macOS overlay scrollbars and on touch devices. Measuring it beats
 * assuming a value, because assuming produces a *reverse* jump on exactly the
 * platforms where there is no scrollbar to compensate for.
 */
function scrollbarWidth(): number {
	if (typeof window === "undefined") return 0;
	return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}
