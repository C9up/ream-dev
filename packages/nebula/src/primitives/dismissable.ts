/// <reference lib="dom" />
/**
 * Dismissable layers — Escape, click-outside and focus-outside, stacked.
 *
 * Every transient surface needs this: Popover, DropdownMenu, ContextMenu,
 * Select, Combobox, Tooltip, Dialog, Sheet, Drawer. Wiring it per component
 * is how you end up with a menu inside a dialog where Escape closes both, or
 * a submenu whose parent collapses the moment you click into it.
 *
 * So layers live in one stack and the rules are applied once, globally:
 *
 * - **Escape** reaches only the topmost layer that accepts it. That is what
 *   makes Escape close a submenu first and its parent menu second.
 * - **Pointer outside** walks the stack top-down and stops at the first layer
 *   the event landed inside. Layers above it close, layers below it stay. A
 *   click in a parent menu therefore closes the submenu and nothing else.
 * - **Focus outside** follows the same walk, but only layers that opt in — a
 *   modal dialog holds focus by design and must not close because focus moved.
 *
 * Layers are portalled, so a nested surface is not a DOM descendant of its
 * parent. Containment is answered per layer by its own element plus whatever
 * it excludes (its trigger, almost always), never by tree position.
 */

export type DismissReason = "escape" | "outside-pointer" | "outside-focus";

export interface DismissableOptions {
	/** The surface itself. Read lazily — it mounts after the layer registers. */
	element: () => HTMLElement | null;
	/** Called when this layer should close. */
	onDismiss: (reason: DismissReason) => void;
	/**
	 * Extra elements that do not count as "outside". The trigger belongs here:
	 * without it, pressing the trigger to close would dismiss on pointerdown and
	 * immediately reopen on click.
	 */
	exclude?: () => ReadonlyArray<HTMLElement | null | undefined>;
	/** Escape dismisses this layer when it is topmost. Default `true`. */
	escapeKey?: boolean;
	/** A pointer press outside dismisses. Default `true`. */
	outsidePointer?: boolean;
	/** Focus moving outside dismisses. Default `false`. */
	outsideFocus?: boolean;
}

export interface DismissableLayer {
	/** Remove this layer from the stack. Safe to call twice. */
	remove(): void;
}

interface Layer extends DismissableOptions {
	readonly id: number;
}

const stack: Layer[] = [];
let nextLayerId = 0;
let listening = false;

/**
 * Register a dismissable layer. The returned handle must be removed when the
 * surface unmounts — a stale layer keeps answering Escape for a surface that
 * is no longer on screen.
 */
export function dismissable(options: DismissableOptions): DismissableLayer {
	nextLayerId += 1;
	const layer: Layer = { ...options, id: nextLayerId };
	stack.push(layer);
	startListening();

	let removed = false;
	return {
		remove(): void {
			if (removed) return;
			removed = true;
			const index = stack.findIndex((entry) => entry.id === layer.id);
			if (index !== -1) stack.splice(index, 1);
			stopListeningIfIdle();
		},
	};
}

/** How many layers are currently open. Used by the Escape/scroll-lock tests. */
export function layerCount(): number {
	return stack.length;
}

// ─── global listeners ────────────────────────────────────────────────

/**
 * Listeners attach on the first layer and detach with the last, rather than
 * living for the lifetime of the page. An app that never opens an overlay
 * pays nothing, and a test that opens and closes one leaves no residue.
 */
function startListening(): void {
	if (listening || typeof document === "undefined") return;
	listening = true;
	document.addEventListener("keydown", onKeyDown, true);
	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("focusin", onFocusIn, true);
}

function stopListeningIfIdle(): void {
	if (!listening || stack.length > 0) return;
	listening = false;
	document.removeEventListener("keydown", onKeyDown, true);
	document.removeEventListener("pointerdown", onPointerDown, true);
	document.removeEventListener("focusin", onFocusIn, true);
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key !== "Escape") return;

	// Topmost layer that accepts Escape — not simply the topmost layer. A
	// Tooltip stacked over a Popover opts out, and Escape must then reach the
	// Popover rather than being swallowed.
	for (let i = stack.length - 1; i >= 0; i -= 1) {
		const layer = stack[i];
		if (layer === undefined) continue;
		if (layer.escapeKey === false) continue;
		event.stopPropagation();
		layer.onDismiss("escape");
		return;
	}
}

function onPointerDown(event: Event): void {
	dismissOutside(event, "outside-pointer");
}

function onFocusIn(event: Event): void {
	dismissOutside(event, "outside-focus");
}

/**
 * Close every layer the event landed outside of, stopping at the first one it
 * landed inside.
 *
 * The snapshot is taken before dismissing: `onDismiss` mutates the stack, and
 * iterating the live array while it shrinks skips layers.
 */
function dismissOutside(event: Event, reason: DismissReason): void {
	const path = eventPath(event);
	const snapshot = stack.slice();

	for (let i = snapshot.length - 1; i >= 0; i -= 1) {
		const layer = snapshot[i];
		if (layer === undefined) continue;
		if (containsEvent(layer, path)) return;

		const optedIn =
			reason === "outside-pointer"
				? layer.outsidePointer !== false
				: layer.outsideFocus === true;

		// A layer that opted out still blocks: closing the one beneath it while
		// it stays open would leave the stack inverted on screen.
		if (!optedIn) return;
		layer.onDismiss(reason);
	}
}

/** Did the event originate inside this layer, or inside anything it excludes? */
function containsEvent(layer: Layer, path: readonly EventTarget[]): boolean {
	const element = layer.element();
	if (element !== null && path.includes(element)) return true;

	const excluded = layer.exclude?.() ?? [];
	for (const candidate of excluded) {
		if (candidate && path.includes(candidate)) return true;
	}
	return false;
}

/**
 * The nodes an event travelled through.
 *
 * `composedPath()` is what makes containment correct across a shadow root,
 * where `event.target` is retargeted to the host and a naive `contains()`
 * check reports the wrong answer. Not every DOM implementation nebula runs
 * against provides it, so the ancestor walk stands in when it is missing.
 */
function eventPath(event: Event): readonly EventTarget[] {
	if (typeof event.composedPath === "function") {
		const path = event.composedPath();
		if (path.length > 0) return path;
	}

	const walked: EventTarget[] = [];
	let node: Node | null = event.target instanceof Node ? event.target : null;
	while (node !== null) {
		walked.push(node);
		node = node.parentNode;
	}
	return walked;
}
