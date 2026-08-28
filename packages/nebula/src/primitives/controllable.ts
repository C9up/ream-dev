/**
 * Controlled / uncontrolled state.
 *
 * Every stateful shadcn component takes the same trio: `open` (the caller
 * owns the state), `defaultOpen` (the component owns it) and `onOpenChange`
 * (told either way). Radix folds that into `useControllableState`; this is the
 * Aurora equivalent, and the reason a Dialog can be opened either by its own
 * trigger or by a signal somewhere else in the app without changing shape.
 *
 *   // uncontrolled — nebula holds the state
 *   Dialog({ defaultOpen: false })
 *
 *   // controlled — the app holds it, nebula only asks
 *   const open = signal(false)
 *   Dialog({ open, onOpenChange: open })
 *
 * The rule is one line: a `value` that reads as anything other than
 * `undefined` wins over the internal signal, on every read. Deciding once at
 * setup instead would freeze a component whose prop only becomes defined after
 * an async load.
 */

import { memo, type ReadSignal, signal } from "@c9up/aurora";
import { type Reactive, read } from "../lib/props.js";

export interface ControllableOptions<T> {
	/** The caller's value. Present means controlled. */
	value?: Reactive<T | undefined>;
	/** Starting value when uncontrolled. */
	initial: T;
	/** Notified on every change, controlled or not. */
	onChange?: (next: T) => void;
}

export interface Controllable<T> {
	/** Current value — the caller's when controlled, ours otherwise. */
	readonly current: ReadSignal<T>;
	/** Request a change. Always notifies; only writes internally when uncontrolled. */
	set(next: T): void;
}

export function controllable<T>(
	options: ControllableOptions<T>,
): Controllable<T> {
	const internal = signal(options.initial);

	const current = memo(() => {
		if (options.value === undefined) return internal();
		const external = read(options.value);
		return external === undefined ? internal() : external;
	});

	return {
		current,
		set(next: T): void {
			// Written even when controlled. The caller may ignore `onChange` and
			// leave its own state put — a "cancel" on a confirm dialog does exactly
			// that — and the internal value has to stay in step for the moment the
			// caller stops controlling it.
			internal(next);
			options.onChange?.(next);
		},
	};
}
