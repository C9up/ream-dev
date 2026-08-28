/// <reference lib="dom" />
/**
 * Type-ahead — jump to an item by typing its first letters.
 *
 * Native `<select>` does it, so a listbox or menu that does not feels broken.
 * The WAI-ARIA practices call for it on listbox, menu, tree and combobox.
 *
 * Two rules carry the whole behaviour, and both come from the native control:
 *
 * - Keys typed within the timeout build one search string, so "st" reaches
 *   "Stockholm" rather than stopping at anything beginning with "t".
 * - Repeating a single letter cycles through the items starting with it, which
 *   is how you reach the third "S" entry without knowing the rest of its name.
 *
 * Matching starts *after* the currently focused item and wraps, so a match
 * always moves forward — otherwise every search would snap back to the first
 * hit in the list and the cycling rule could never take effect.
 */

const RESET_AFTER_MS = 1000;

export interface TypeaheadOptions {
	/** Current candidates, in display order. Re-read on every keypress. */
	items: () => readonly HTMLElement[];
	/** The item to search from. Defaults to whatever has focus. */
	current?: () => HTMLElement | null;
	/** A match was found. */
	onMatch: (item: HTMLElement) => void;
	/** Text to match against. Defaults to the item's trimmed text content. */
	textOf?: (item: HTMLElement) => string;
	/** How long keys keep accumulating. Default `1000`ms. */
	resetAfter?: number;
}

export interface Typeahead {
	/**
	 * Feed a keydown in. Returns `true` when the key was consumed as search
	 * input, so the caller can skip its own handling for that press.
	 */
	handleKey(event: KeyboardEvent): boolean;
	/** Drop the buffer — call when the surface closes. */
	reset(): void;
}

export function typeahead(options: TypeaheadOptions): Typeahead {
	const resetAfter = options.resetAfter ?? RESET_AFTER_MS;
	let buffer = "";
	let timer: ReturnType<typeof setTimeout> | undefined;

	function reset(): void {
		buffer = "";
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function restartTimer(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(reset, resetAfter);
	}

	return {
		reset,

		handleKey(event: KeyboardEvent): boolean {
			if (!isSearchKey(event, buffer.length > 0)) return false;

			buffer += event.key.toLowerCase();
			restartTimer();

			const items = options.items();
			if (items.length === 0) return true;

			// A buffer of one repeated character means "next item starting with it",
			// not "item starting with that string repeated".
			const query = allSameCharacter(buffer) ? (buffer[0] ?? "") : buffer;
			const skipCurrent = allSameCharacter(buffer) && buffer.length > 1;

			const from = startIndex(items, options.current?.() ?? focusedElement());
			const match = findFrom(items, query, from, skipCurrent, options.textOf);
			if (match !== null) options.onMatch(match);
			return true;
		},
	};
}

/**
 * Is this keypress search input?
 *
 * Single printable characters only. `event.key` is `"a"` for a letter but
 * `"ArrowDown"` or `"Enter"` for a control key, so a length check separates
 * them without a keycode table. Modifiers are excluded because Ctrl+F belongs
 * to the browser — but Shift is not, since it is how you type a capital.
 *
 * Space is the one character that depends on context. On an empty buffer it
 * means "activate the focused item" and must reach the caller untouched; once
 * a search is under way it is a word separator, and swallowing it is what lets
 * "new y" reach "New York".
 */
function isSearchKey(event: KeyboardEvent, hasBuffer: boolean): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	if (event.key.length !== 1) return false;
	if (event.key === " ") return hasBuffer;
	return true;
}

function allSameCharacter(value: string): boolean {
	if (value.length < 2) return true;
	const first = value[0];
	for (const character of value) {
		if (character !== first) return false;
	}
	return true;
}

function focusedElement(): HTMLElement | null {
	if (typeof document === "undefined") return null;
	const active = document.activeElement;
	return active instanceof HTMLElement ? active : null;
}

function startIndex(
	items: readonly HTMLElement[],
	current: HTMLElement | null,
): number {
	if (current === null) return 0;
	const index = items.indexOf(current);
	return index === -1 ? 0 : index;
}

/**
 * First item matching `query`, searching forward from `from` and wrapping.
 *
 * `skipCurrent` is the cycling rule: repeating a letter must advance past the
 * item already selected. A fresh search keeps the current item eligible, so
 * typing the first letters of what is already highlighted does not jump away.
 */
function findFrom(
	items: readonly HTMLElement[],
	query: string,
	from: number,
	skipCurrent: boolean,
	textOf?: (item: HTMLElement) => string,
): HTMLElement | null {
	if (query === "") return null;

	const offset = skipCurrent ? 1 : 0;
	for (let i = 0; i < items.length; i += 1) {
		const item = items[(from + i + offset) % items.length];
		if (item === undefined) continue;
		const text = (textOf?.(item) ?? item.textContent ?? "")
			.trim()
			.toLowerCase();
		if (text.startsWith(query)) return item;
	}
	return null;
}
