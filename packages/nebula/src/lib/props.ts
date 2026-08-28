/**
 * Reactive prop plumbing.
 *
 * React components take plain values and re-render. Aurora never re-renders —
 * a binding stays live because the value handed to it is a signal or a plain
 * accessor function, which the renderer wraps in an `effect()`. So every
 * nebula prop that can change over time is typed `Reactive<T>`: pass a
 * constant when it never moves, pass `() => count() > 3` when it does.
 *
 *   Button({ disabled: true })              // static
 *   Button({ disabled: () => !form.valid })  // live
 *
 * `read()` collapses either form to a value. `accessor()` does the opposite —
 * it hands the renderer something it can always subscribe to, which is what
 * you want inside a template so the static case does not silently freeze a
 * binding that a sibling prop makes dynamic.
 */

/** A prop value that may be constant or recomputed on demand. */
export type Reactive<T> = T | (() => T);

/**
 * Is this prop the accessor form?
 *
 * A type predicate rather than a cast: `Reactive<T>` where `T` is itself a
 * function type is genuinely ambiguous, and nebula resolves it one way on
 * purpose — a function always means "call me". No nebula prop is typed to
 * receive a function as its *value*; callbacks (`onClick`, `onValueChange`)
 * have their own prop types and never pass through here.
 */
function isAccessor<T>(value: Reactive<T>): value is () => T {
	return typeof value === "function";
}

/**
 * Collapse a reactive prop to its current value.
 *
 * An absent prop stays `undefined` rather than throwing, because that is
 * exactly what `cva` wants: an axis left `undefined` falls back to its default
 * variant. It lets a component forward props straight through —
 * `buttonVariants({ variant: read(props.variant) })` — with no per-prop
 * presence check, which is the difference between two lines and ten in every
 * component in the library.
 */
export function read<T>(value: Reactive<T>): T;
export function read<T>(value: Reactive<T> | undefined): T | undefined;
export function read<T>(value: Reactive<T> | undefined): T | undefined {
	if (value === undefined) return undefined;
	return isAccessor(value) ? value() : value;
}

/** Collapse an optional reactive prop, falling back when it is absent. */
export function readOr<T>(value: Reactive<T> | undefined, fallback: T): T {
	if (value === undefined) return fallback;
	return isAccessor(value) ? value() : value;
}

/**
 * Turn any prop into an accessor the renderer can subscribe to.
 *
 * Templates should bind `${accessor(props.disabled, false)}` rather than
 * `${readOr(props.disabled, false)}`: the second reads once at construction
 * and the attribute never updates again.
 */
export function accessor<T>(
	value: Reactive<T> | undefined,
	fallback: T,
): () => T {
	return () => readOr(value, fallback);
}

/**
 * Call a handler if one was supplied.
 *
 * Saves every component the `props.onClick?.(event)` dance and keeps the
 * optional-callback shape identical across the library.
 */
export function callHandler<A extends readonly unknown[]>(
	handler: ((...args: A) => void) | undefined,
	...args: A
): void {
	handler?.(...args);
}
