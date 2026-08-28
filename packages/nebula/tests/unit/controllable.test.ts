import { signal } from "@c9up/aurora";
import { describe, expect, it, vi } from "vitest";
import { controllable } from "../../src/primitives/controllable.js";

describe("controllable", () => {
	it("owns its state when no value is supplied", () => {
		const state = controllable<boolean>({ initial: false });
		expect(state.current()).toBe(false);
		state.set(true);
		expect(state.current()).toBe(true);
	});

	it("defers to the caller's signal when controlled", () => {
		const external = signal(false);
		const state = controllable<boolean>({ value: external, initial: false });

		external(true);
		expect(state.current()).toBe(true);
	});

	it("does not move the caller's value on its own", () => {
		const external = signal(false);
		const onChange = vi.fn();
		const state = controllable<boolean>({
			value: external,
			initial: false,
			onChange,
		});

		state.set(true);
		expect(onChange).toHaveBeenCalledWith(true);
		// The caller ignored the request, so the reported value must not move —
		// this is what lets a confirm dialog refuse to close.
		expect(external()).toBe(false);
		expect(state.current()).toBe(false);
	});

	it("falls back to internal state when the controlled value reads undefined", () => {
		// A prop that only becomes defined after an async load: deciding
		// controlled-or-not once at setup would freeze the component.
		const external = signal<boolean | undefined>(undefined);
		const state = controllable<boolean>({ value: external, initial: false });

		state.set(true);
		expect(state.current()).toBe(true);

		external(false);
		expect(state.current()).toBe(false);
	});

	it("notifies on every change, controlled or not", () => {
		const onChange = vi.fn();
		const state = controllable<string>({ initial: "a", onChange });
		state.set("b");
		state.set("c");
		expect(onChange.mock.calls).toEqual([["b"], ["c"]]);
	});
});
