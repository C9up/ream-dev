/// <reference lib="dom" />
/**
 * Floating placement — where a popover, menu, select or tooltip goes.
 *
 * This is the piece Radix delegates to `@floating-ui/dom`. nebula computes it
 * instead, because the alternative is a runtime dependency in a workspace
 * whose stated position is that `cn` was worth reimplementing rather than
 * pulling in clsx and tailwind-merge.
 *
 * Scope is chosen to make that defensible. Floating UI is a general middleware
 * pipeline; this is the four behaviours the shadcn component set actually
 * uses — `offset`, `flip`, `shift`, and arrow centring — plus the available
 * height a scrollable menu needs for its `max-height`. No middleware
 * abstraction, no virtual elements, no `autoPlacement`.
 *
 * The geometry lives in `resolvePosition`, a pure function over rectangles.
 * Everything that touches the DOM — measuring, writing styles, watching for
 * scroll — is in `autoPosition` around it. That split is what lets the flip
 * and shift rules be tested exhaustively without a browser, which matters
 * because they are where placement bugs actually live.
 *
 * Coordinates are viewport-relative and meant for `position: fixed`. Fixed
 * positioning is what lets a portalled surface ignore every transformed or
 * clipping ancestor between it and the root; an absolutely positioned popover
 * has to find an offset parent, and gets it wrong the moment one appears.
 */

export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";
export type Placement = Side | `${Side}-${Align}`;

/** Just the fields of a DOMRect the maths needs. */
export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface Viewport {
	readonly width: number;
	readonly height: number;
}

export interface PositionOptions {
	/** Preferred placement. Default `"bottom"`. */
	placement?: Placement;
	/** Gap between anchor and surface, in px. Default `4`. */
	offset?: number;
	/** Keep this much clearance from the viewport edge. Default `8`. */
	padding?: number;
	/** Flip to the opposite side when the preferred one does not fit. Default `true`. */
	flip?: boolean;
	/** Slide along the cross axis to stay on screen. Default `true`. */
	shift?: boolean;
	/** Arrow size in px; centres the arrow and keeps it off the corners. */
	arrowSize?: number;
}

export interface Position {
	readonly x: number;
	readonly y: number;
	/** Placement actually used — may differ from the request after a flip. */
	readonly placement: Placement;
	readonly side: Side;
	readonly align: Align;
	/**
	 * Space between the surface's edge and the viewport on the resolved side.
	 * Menus bind it to `max-height` so a long list scrolls instead of
	 * overflowing off screen.
	 */
	readonly availableHeight: number;
	/** Arrow offset along the surface's cross axis, when `arrowSize` was given. */
	readonly arrow?: { readonly x?: number; readonly y?: number };
}

const DEFAULT_OFFSET = 4;
const DEFAULT_PADDING = 8;

/**
 * Compute where the surface goes. Pure — no DOM, no side effects.
 *
 * Order matters and matches Floating UI's: offset, then flip, then shift.
 * Shifting before flipping would slide a surface halfway off the anchor to
 * make room on a side that should have been abandoned entirely.
 */
export function resolvePosition(
	anchor: Rect,
	floating: Rect,
	viewport: Viewport,
	options: PositionOptions = {},
): Position {
	const offset = options.offset ?? DEFAULT_OFFSET;
	const padding = options.padding ?? DEFAULT_PADDING;
	const requested = options.placement ?? "bottom";
	const [requestedSide, align] = splitPlacement(requested);

	const side =
		options.flip === false
			? requestedSide
			: bestSide(requestedSide, anchor, floating, viewport, offset, padding);

	let { x, y } = coordsFor(side, align, anchor, floating, offset);

	if (options.shift !== false) {
		if (isVertical(side)) {
			x = clamp(x, padding, viewport.width - floating.width - padding);
		} else {
			y = clamp(y, padding, viewport.height - floating.height - padding);
		}
	}

	const position: Position = {
		x,
		y,
		placement: align === "center" ? side : `${side}-${align}`,
		side,
		align,
		availableHeight: spaceOn(side, anchor, viewport, offset, padding),
	};

	if (options.arrowSize === undefined) return position;
	return {
		...position,
		arrow: arrowOffset(
			side,
			anchor,
			floating,
			{ x, y },
			options.arrowSize,
			padding,
		),
	};
}

// ─── geometry ────────────────────────────────────────────────────────

function splitPlacement(placement: Placement): [Side, Align] {
	const dash = placement.indexOf("-");
	if (dash === -1) return [toSide(placement), "center"];
	return [toSide(placement.slice(0, dash)), toAlign(placement.slice(dash + 1))];
}

/**
 * Narrow a substring back to `Side` / `Align`.
 *
 * `splitPlacement` slices a string the type system already proved is a valid
 * `Placement`, but slicing erases that. A guard restores it without a cast,
 * and the fallback keeps a hand-built placement string from crashing the
 * layout — it lands on the default instead.
 */
function toSide(value: string): Side {
	return value === "top" || value === "right" || value === "left"
		? value
		: "bottom";
}

function toAlign(value: string): Align {
	return value === "start" || value === "end" ? value : "center";
}

function isVertical(side: Side): boolean {
	return side === "top" || side === "bottom";
}

function opposite(side: Side): Side {
	if (side === "top") return "bottom";
	if (side === "bottom") return "top";
	if (side === "left") return "right";
	return "left";
}

/** Top-left corner of the surface for a given side and alignment. */
function coordsFor(
	side: Side,
	align: Align,
	anchor: Rect,
	floating: Rect,
	offset: number,
): { x: number; y: number } {
	if (isVertical(side)) {
		const y =
			side === "bottom"
				? anchor.y + anchor.height + offset
				: anchor.y - floating.height - offset;
		return {
			x: alignedStart(anchor.x, anchor.width, floating.width, align),
			y,
		};
	}

	const x =
		side === "right"
			? anchor.x + anchor.width + offset
			: anchor.x - floating.width - offset;
	return {
		x,
		y: alignedStart(anchor.y, anchor.height, floating.height, align),
	};
}

/** Where the surface starts along the cross axis, for one alignment. */
function alignedStart(
	anchorStart: number,
	anchorSize: number,
	floatingSize: number,
	align: Align,
): number {
	if (align === "start") return anchorStart;
	if (align === "end") return anchorStart + anchorSize - floatingSize;
	return anchorStart + (anchorSize - floatingSize) / 2;
}

/** Room between the anchor and the viewport edge on one side. */
function spaceOn(
	side: Side,
	anchor: Rect,
	viewport: Viewport,
	offset: number,
	padding: number,
): number {
	const raw =
		side === "top"
			? anchor.y
			: side === "bottom"
				? viewport.height - (anchor.y + anchor.height)
				: side === "left"
					? anchor.x
					: viewport.width - (anchor.x + anchor.width);
	return Math.max(0, raw - offset - padding);
}

/**
 * Keep the requested side unless the opposite one is genuinely better.
 *
 * "Better" is not "has more room": flipping a menu that overflows by two
 * pixels is more disruptive than letting it shift. So the opposite side has to
 * both fit and beat the requested one. When neither fits, the roomier side
 * wins and `availableHeight` lets the surface scroll inside it.
 */
function bestSide(
	requested: Side,
	anchor: Rect,
	floating: Rect,
	viewport: Viewport,
	offset: number,
	padding: number,
): Side {
	const needed = isVertical(requested) ? floating.height : floating.width;
	const here = spaceOn(requested, anchor, viewport, offset, padding);
	if (here >= needed) return requested;

	const other = opposite(requested);
	const there = spaceOn(other, anchor, viewport, offset, padding);
	if (there >= needed) return other;

	return there > here ? other : requested;
}

/**
 * Centre the arrow on the anchor, then pull it back off the corners.
 *
 * The arrow tracks the *anchor*, not the surface: once shift has slid the
 * surface sideways, an arrow centred on the surface points at empty space.
 * The clamp keeps it clear of the rounded corners, where it would otherwise
 * poke out of the border radius.
 */
function arrowOffset(
	side: Side,
	anchor: Rect,
	floating: Rect,
	coords: { x: number; y: number },
	arrowSize: number,
	padding: number,
): { x?: number; y?: number } {
	if (isVertical(side)) {
		const centre = anchor.x + anchor.width / 2 - coords.x - arrowSize / 2;
		const limit = floating.width - arrowSize - padding;
		return { x: clamp(centre, padding, Math.max(padding, limit)) };
	}
	const centre = anchor.y + anchor.height / 2 - coords.y - arrowSize / 2;
	const limit = floating.height - arrowSize - padding;
	return { y: clamp(centre, padding, Math.max(padding, limit)) };
}

function clamp(value: number, min: number, max: number): number {
	// `max` can fall below `min` when the surface is wider than the viewport.
	// Pinning to `min` keeps the leading edge visible, which is the readable
	// half; honouring `max` instead would push the start off screen.
	if (max < min) return min;
	return Math.min(Math.max(value, min), max);
}

// ─── DOM binding ─────────────────────────────────────────────────────

export interface AutoPositionOptions extends PositionOptions {
	/** The arrow element to position, if the surface has one. */
	arrow?: () => HTMLElement | null;
	/** Force the surface to the anchor's width. Select and Combobox use it. */
	matchWidth?: boolean;
	/** Called after each reposition — for `data-side` attributes and the like. */
	onPositioned?: (position: Position) => void;
}

export interface AutoPosition {
	/** Recompute and rewrite the styles now. */
	update(): void;
	/** Stop watching. Styles already written are left in place. */
	stop(): void;
}

/**
 * Position `floating` against `anchor` and keep it there.
 *
 * Updates run on scroll (captured, so ancestor scroll containers are covered
 * without walking the tree to find them) and on resize, plus whenever either
 * element changes size where `ResizeObserver` exists. A menu whose content
 * loads in and grows would otherwise stay positioned for its old height.
 */
export function autoPosition(
	anchor: HTMLElement,
	floating: HTMLElement,
	options: AutoPositionOptions = {},
): AutoPosition {
	function update(): void {
		const anchorRect = anchor.getBoundingClientRect();
		if (options.matchWidth === true) {
			floating.style.width = `${anchorRect.width}px`;
		}

		const floatingRect = floating.getBoundingClientRect();
		const position = resolvePosition(
			anchorRect,
			floatingRect,
			{ width: window.innerWidth, height: window.innerHeight },
			options,
		);

		floating.style.position = "fixed";
		floating.style.left = `${Math.round(position.x)}px`;
		floating.style.top = `${Math.round(position.y)}px`;

		// Exposed as custom properties so the *stylesheet* decides what to do with
		// them. shadcn's menus read the available height through
		// `max-h-(--nebula-available-height)`, which keeps the scroll decision in
		// CSS rather than hardcoding a pixel max-height from script.
		floating.style.setProperty(
			"--nebula-available-height",
			`${Math.round(position.availableHeight)}px`,
		);
		floating.style.setProperty(
			"--nebula-anchor-width",
			`${Math.round(anchorRect.width)}px`,
		);
		floating.setAttribute("data-side", position.side);
		floating.setAttribute("data-align", position.align);

		const arrowEl = options.arrow?.();
		if (arrowEl && position.arrow) {
			const { x, y } = position.arrow;
			arrowEl.style.position = "absolute";
			arrowEl.style.left = x === undefined ? "" : `${Math.round(x)}px`;
			arrowEl.style.top = y === undefined ? "" : `${Math.round(y)}px`;
		}

		options.onPositioned?.(position);
	}

	update();

	const onScrollOrResize = (): void => update();
	window.addEventListener("scroll", onScrollOrResize, true);
	window.addEventListener("resize", onScrollOrResize);

	const observer = observeSizes([anchor, floating], update);

	let stopped = false;
	return {
		update,
		stop(): void {
			if (stopped) return;
			stopped = true;
			window.removeEventListener("scroll", onScrollOrResize, true);
			window.removeEventListener("resize", onScrollOrResize);
			observer?.disconnect();
		},
	};
}

/**
 * Watch elements for size changes, where the platform supports it.
 *
 * happy-dom (nebula's unit-test environment) has no `ResizeObserver`, and the
 * scroll and resize listeners already cover the common cases, so its absence
 * degrades rather than throws.
 */
function observeSizes(
	elements: readonly HTMLElement[],
	onResize: () => void,
): ResizeObserver | null {
	if (typeof ResizeObserver !== "function") return null;
	const observer = new ResizeObserver(onResize);
	for (const element of elements) observer.observe(element);
	return observer;
}
