/**
 * Command — a searchable list of actions.
 *
 * The palette pattern: type to filter, arrows to move, Enter to run. Used on
 * its own inside a Popover, or full-screen through `CommandDialog`.
 *
 * The filter is the interesting decision. `cmdk`, which shadcn wraps, scores
 * matches with a fuzzy algorithm; nebula matches on substring, plus an
 * optional `keywords` list per item. Fuzzy matching is impressive on a demo
 * and frustrating in use — it surfaces items the user did not type anything
 * resembling, and the ranking is impossible to predict. Substring plus
 * keywords is predictable, and "s" reaching "Settings" is a keyword, not an
 * algorithm.
 *
 * Focus stays in the search input the whole time; the highlighted item is
 * named with `aria-activedescendant`. Moving DOM focus onto the list would
 * take it out of the input and the next keystroke would go nowhere.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { SearchIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface CommandItem {
	/** Stable key. */
	value: string;
	label: string;
	icon?: Child;
	/** Extra terms that should match this item. */
	keywords?: readonly string[];
	shortcut?: string;
	disabled?: boolean;
	group?: string;
	onSelect?: () => void;
}

export interface CommandProps {
	items: readonly CommandItem[];
	placeholder?: string;
	/** Shown when the filter matches nothing. */
	emptyMessage?: Child;
	/** Replace the built-in substring filter. */
	filter?: (item: CommandItem, query: string) => boolean;
	class?: Reactive<string>;
	onSelect?: (item: CommandItem) => void;
}

/** Substring over the label, then over each keyword. */
export function defaultFilter(item: CommandItem, query: string): boolean {
	if (query === "") return true;
	const needle = query.toLowerCase();
	if (item.label.toLowerCase().includes(needle)) return true;
	return (item.keywords ?? []).some((keyword) =>
		keyword.toLowerCase().includes(needle),
	);
}

export const Command = component<CommandProps>((props) => {
	const inputId = uid("command-input");
	const listId = uid("command-list");
	const itemIds = new Map<string, string>();
	for (const item of props.items) itemIds.set(item.value, uid("command-item"));

	const query = signal("");
	const active = signal<string | undefined>(undefined);

	function matches(): readonly CommandItem[] {
		const filter = props.filter ?? defaultFilter;
		return props.items.filter(
			(item) => item.disabled !== true && filter(item, query()),
		);
	}

	function run(item: CommandItem): void {
		if (item.disabled === true) return;
		item.onSelect?.();
		props.onSelect?.(item);
	}

	function move(delta: number): void {
		const list = matches();
		if (list.length === 0) return;
		const from = list.findIndex((item) => item.value === active());
		const next = from === -1 ? (delta > 0 ? 0 : list.length - 1) : from + delta;
		// Wrapping is right here, unlike in a menu: a palette is a search result
		// list and the user is scanning it, not navigating a fixed structure.
		const target = list[(next + list.length) % list.length];
		if (target !== undefined) {
			active(target.value);
			scrollIntoView(target.value);
		}
	}

	function scrollIntoView(value: string): void {
		const id = itemIds.get(value);
		if (id === undefined) return;
		document.getElementById(id)?.scrollIntoView({ block: "nearest" });
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			move(-1);
		} else if (event.key === "Enter") {
			event.preventDefault();
			const current = matches().find((item) => item.value === active());
			if (current !== undefined) run(current);
		}
	}

	function onInput(event: Event): void {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		query(target.value);
		// Re-point the highlight at the first result: leaving it on an item the
		// new query filtered out means Enter runs something invisible.
		active(matches()[0]?.value);
	}

	return html`<div
		data-slot="command"
		class="${() =>
			cn(
				"bg-popover text-popover-foreground flex size-full flex-col overflow-hidden rounded-md",
				read(props.class),
			)}"
	>
		<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
			${SearchIcon({ class: "size-4 shrink-0 opacity-50" })}
			<input
				data-slot="command-input"
				id="${inputId}"
				type="text"
				role="combobox"
				autocomplete="off"
				aria-expanded="true"
				aria-controls="${listId}"
				aria-activedescendant="${() => {
					const current = active();
					return current === undefined ? undefined : itemIds.get(current);
				}}"
				placeholder="${props.placeholder ?? "Type a command or search…"}"
				class="placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
				@input="${onInput}"
				@keydown="${onKeyDown}"
			/>
		</div>
		<div
			data-slot="command-list"
			id="${listId}"
			role="listbox"
			class="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto p-1"
		>
			${() => renderResults()}
		</div>
	</div>`;

	function renderResults(): Child {
		const list = matches();
		if (list.length === 0) {
			return html`<div
				data-slot="command-empty"
				role="presentation"
				class="py-6 text-center text-sm"
			>${props.emptyMessage ?? "No results found."}</div>`;
		}

		let lastGroup: string | undefined;
		return list.map((item) => {
			const heading =
				item.group !== undefined && item.group !== lastGroup
					? html`<div
							role="presentation"
							class="text-muted-foreground px-2 py-1.5 text-xs font-medium"
						>${item.group}</div>`
					: null;
			lastGroup = item.group;
			return [heading, renderItem(item)];
		});
	}

	function renderItem(item: CommandItem): Child {
		return html`<div
			role="option"
			data-slot="command-item"
			id="${itemIds.get(item.value)}"
			aria-selected="${() => (active() === item.value ? "true" : "false")}"
			data-active="${() => (active() === item.value ? "" : undefined)}"
			class="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[active]:bg-accent data-[active]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
			@click="${() => run(item)}"
			@pointerenter="${() => active(item.value)}"
		>
			${item.icon}
			<span class="flex-1 truncate">${item.label}</span>
			${
				item.shortcut === undefined
					? null
					: html`<span class="text-muted-foreground ml-auto text-xs tracking-widest"
						>${item.shortcut}</span
					>`
			}
		</div>`;
	}
});
