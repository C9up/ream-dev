/**
 * InputOTP — a one-time code entered one character per box.
 *
 * The behaviour users expect from this control is entirely in the edge cases,
 * and each one is a separate rule:
 *
 * - Typing advances to the next box; the last one stays put rather than
 *   wrapping round to the first.
 * - Backspace in an empty box clears the *previous* one and moves back, which
 *   is what makes holding it down erase the whole code.
 * - Pasting a code fills every box from wherever it was pasted, so the common
 *   case — copy the code out of the email, click the first box, paste — works.
 * - `inputmode="numeric"` and `autocomplete="one-time-code"` are what get the
 *   numeric keypad on mobile and the OS's SMS autofill suggestion. Without the
 *   second, a user has to leave the app to read the code.
 *
 * The joined value is mirrored into a hidden input so the control submits as
 * one field, rather than six.
 */

import { component, html, signal } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface InputOTPProps {
	/** Number of boxes. Default `6`. */
	length?: number;
	name?: string;
	disabled?: Reactive<boolean>;
	/** Insert a visual gap after this many boxes. `3` gives `123 456`. */
	groupAfter?: number;
	class?: Reactive<string>;
	onValueChange?: (value: string) => void;
	/** Fired once every box is filled. */
	onComplete?: (value: string) => void;
}

const slotClasses =
	"border-input relative flex size-9 items-center justify-center border-y border-r text-center text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md focus:border-ring focus:ring-ring/50 focus:z-10 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

export const InputOTP = component<InputOTPProps>((props) => {
	const length = props.length ?? 6;
	const groupId = uid("input-otp");
	const characters = signal<readonly string[]>(new Array(length).fill(""));

	function boxes(): HTMLInputElement[] {
		const root = document.getElementById(groupId);
		if (root === null) return [];
		const found: HTMLInputElement[] = [];
		for (const node of root.querySelectorAll("input[data-otp-index]")) {
			if (node instanceof HTMLInputElement) found.push(node);
		}
		return found;
	}

	function focusBox(index: number): void {
		const target = boxes()[Math.min(Math.max(index, 0), length - 1)];
		target?.focus();
		target?.select();
	}

	function commit(next: readonly string[]): void {
		characters(next);
		const joined = next.join("");
		props.onValueChange?.(joined);
		if (joined.length === length && !next.includes(""))
			props.onComplete?.(joined);
	}

	function write(index: number, character: string): void {
		const next = [...characters()];
		next[index] = character;
		commit(next);
	}

	function onInput(index: number, event: Event): void {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;

		// A box already holding a character receives the new one appended; keep
		// the last, which is what the user just typed.
		const typed = target.value.slice(-1);
		target.value = typed;
		write(index, typed);
		if (typed !== "" && index < length - 1) focusBox(index + 1);
	}

	function onKeyDown(index: number, event: KeyboardEvent): void {
		if (event.key === "Backspace") {
			if (characters()[index] === "" && index > 0) {
				event.preventDefault();
				write(index - 1, "");
				focusBox(index - 1);
			}
			return;
		}
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			focusBox(index - 1);
			return;
		}
		if (event.key === "ArrowRight") {
			event.preventDefault();
			focusBox(index + 1);
		}
	}

	function onPaste(index: number, event: ClipboardEvent): void {
		const pasted = event.clipboardData?.getData("text") ?? "";
		if (pasted === "") return;
		event.preventDefault();

		const next = [...characters()];
		let cursor = index;
		for (const character of pasted) {
			if (cursor >= length) break;
			next[cursor] = character;
			cursor += 1;
		}
		commit(next);

		// Reflect into the DOM: the boxes are uncontrolled between keystrokes, so
		// writing the signal alone would leave the pasted characters invisible.
		const inputs = boxes();
		next.forEach((character, position) => {
			const input = inputs[position];
			if (input !== undefined) input.value = character;
		});
		focusBox(Math.min(cursor, length - 1));
	}

	const indices = Array.from({ length }, (_unused, index) => index);

	return html`<div
		data-slot="input-otp"
		id="${groupId}"
		class="${() => cn("flex items-center gap-2", read(props.class))}"
	>
		<div class="flex items-center">
			${indices.map(
				(index) => html`${
					props.groupAfter !== undefined &&
					index > 0 &&
					index % props.groupAfter === 0
						? html`<span aria-hidden="true" class="mx-1 text-muted-foreground">-</span>`
						: null
				}<input
					data-slot="input-otp-slot"
					data-otp-index="${index}"
					type="text"
					inputmode="numeric"
					autocomplete="${index === 0 ? "one-time-code" : "off"}"
					maxlength="1"
					aria-label="${`Character ${index + 1} of ${length}`}"
					?disabled="${() => readOr(props.disabled, false)}"
					class="${slotClasses}"
					@input="${(event: Event) => onInput(index, event)}"
					@keydown="${(event: KeyboardEvent) => onKeyDown(index, event)}"
					@paste="${(event: ClipboardEvent) => onPaste(index, event)}"
				/>`,
			)}
		</div>
		<input type="hidden" name="${props.name}" .value="${() => characters().join("")}" />
	</div>`;
});
