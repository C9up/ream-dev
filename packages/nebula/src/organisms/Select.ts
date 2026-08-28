/**
 * Select — choose one option from a list.
 *
 * A custom listbox, not a styled `<select>`. This is the one place nebula
 * gives up native behaviour, and the reason is that a `<select>` popup is
 * drawn by the operating system: its font, its colours and its checkmarks
 * cannot be styled at all, and options cannot contain anything but text. A
 * design system that can style every control except this one is not a design
 * system.
 *
 * What that costs is everything the native control was doing for free, and it
 * all has to be put back:
 *
 * - `role="combobox"` on the trigger, `role="listbox"` on the panel,
 *   `role="option"` with `aria-selected` on each entry.
 * - `aria-activedescendant` rather than moving DOM focus — the listbox pattern
 *   keeps focus on the trigger and *names* the highlighted option, which is
 *   what lets a screen reader announce it without the focus ring jumping.
 * - Type-ahead, arrows, Home/End, Enter and Escape.
 * - A hidden input, so the control still posts with a plain HTML form.
 *
 * The panel is sized to the trigger and capped at the space available below
 * it, so a hundred-option list scrolls rather than running off the screen.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { CheckIcon, ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
	/** Groups consecutive options under a heading. */
	group?: string;
}

export interface SelectProps {
	options: readonly SelectOption[];
	name?: string;
	value?: Reactive<string | undefined>;
	defaultValue?: string;
	placeholder?: string;
	disabled?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	required?: boolean;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
	onValueChange?: (value: string) => void;
}

export const selectTriggerClasses =
	"border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-fit min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const Select = component<SelectProps>((props) => {
	const triggerId = uid("select-trigger");
	const listId = uid("select-list");
	const optionIds = new Map<string, string>();
	for (const option of props.options)
		optionIds.set(option.value, uid("select-option"));

	const open = signal(false);
	const selection = controllable<string | undefined>({
		value: props.value,
		initial: props.defaultValue,
		onChange: (next) => {
			if (next !== undefined) props.onValueChange?.(next);
		},
	});
	/** The option the keyboard is on. Distinct from the selected one. */
	const active = signal<string | undefined>(undefined);

	const enabled = (): readonly SelectOption[] =>
		props.options.filter((option) => option.disabled !== true);

	function labelFor(value: string | undefined): string | undefined {
		return props.options.find((option) => option.value === value)?.label;
	}

	function choose(value: string): void {
		selection.set(value);
		active(value);
		open(false);
		focusSilently(document.getElementById(triggerId));
	}

	function moveActive(delta: number): void {
		const list = enabled();
		if (list.length === 0) return;
		const from = list.findIndex((option) => option.value === active());
		const next = from === -1 ? (delta > 0 ? 0 : list.length - 1) : from + delta;
		const clamped = Math.min(Math.max(next, 0), list.length - 1);
		const target = list[clamped];
		if (target !== undefined) active(target.value);
	}

	/**
	 * Type-ahead over the option *data*, not over elements.
	 *
	 * The shared primitive walks DOM nodes, which works for menus where focus
	 * moves. Here focus stays on the trigger and only `aria-activedescendant`
	 * moves, so the search runs over the options array instead.
	 */
	let buffer = "";
	let bufferTimer: ReturnType<typeof setTimeout> | undefined;

	function seekByText(character: string): void {
		buffer += character.toLowerCase();
		if (bufferTimer !== undefined) clearTimeout(bufferTimer);
		bufferTimer = setTimeout(() => {
			buffer = "";
		}, 1000);

		const list = enabled();
		const from = list.findIndex((option) => option.value === active());
		for (let i = 1; i <= list.length; i += 1) {
			const option = list[(Math.max(from, 0) + i) % list.length];
			if (option === undefined) continue;
			if (option.label.toLowerCase().startsWith(buffer)) {
				active(option.value);
				return;
			}
		}
	}

	function onTriggerKeyDown(event: KeyboardEvent): void {
		if (readOr(props.disabled, false)) return;

		if (!open()) {
			if (
				event.key === "ArrowDown" ||
				event.key === "Enter" ||
				event.key === " "
			) {
				event.preventDefault();
				active(selection.current() ?? enabled()[0]?.value);
				open(true);
			}
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			moveActive(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			moveActive(-1);
		} else if (event.key === "Home") {
			event.preventDefault();
			active(enabled()[0]?.value);
		} else if (event.key === "End") {
			event.preventDefault();
			active(enabled()[enabled().length - 1]?.value);
		} else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const current = active();
			if (current !== undefined) choose(current);
		} else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
			seekByText(event.key);
		}
	}

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => open(false),
		placement: "bottom-start",
		offset: 4,
		matchWidth: true,
		// Focus never enters the panel — the listbox pattern keeps it on the
		// trigger — so nothing here traps or moves it.
		content: renderList,
		onOpened: scrollActiveIntoView,
	});

	function renderList(): ReturnType<typeof html> {
		let lastGroup: string | undefined;

		return html`<div
			data-slot="select-content"
			id="${listId}"
			role="listbox"
			aria-labelledby="${triggerId}"
			class="${cn(
				"bg-popover text-popover-foreground z-50 max-h-(--nebula-available-height) min-w-(--nebula-anchor-width) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
				zoomInOut,
				read(props.contentClass),
			)}"
		>
			${props.options.map((option) => {
				const heading =
					option.group !== undefined && option.group !== lastGroup
						? html`<div class="text-muted-foreground px-2 py-1.5 text-xs">${option.group}</div>`
						: null;
				lastGroup = option.group;
				return [heading, renderOption(option)];
			})}
		</div>`;
	}

	function renderOption(option: SelectOption): Child {
		const chosen = (): boolean => selection.current() === option.value;
		return html`<div
			role="option"
			id="${optionIds.get(option.value)}"
			data-slot="select-item"
			data-value="${option.value}"
			aria-selected="${() => (chosen() ? "true" : "false")}"
			data-active="${() => (active() === option.value ? "" : undefined)}"
			data-disabled="${option.disabled === true ? "" : undefined}"
			class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-[active]:bg-accent data-[active]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
			@click="${() => {
				if (option.disabled !== true) choose(option.value);
			}}"
			@pointerenter="${() => {
				if (option.disabled !== true) active(option.value);
			}}"
		>
			<span class="flex-1 truncate">${option.label}</span>
			<span class="absolute right-2 flex size-3.5 items-center justify-center">
				${() => (chosen() ? CheckIcon({ class: "size-4" }) : null)}
			</span>
		</div>`;
	}

	/**
	 * Bring the highlighted option into view when the panel opens.
	 *
	 * Opening a two-hundred-option select on the one already chosen and showing
	 * the top of the list is the standard failure of a custom select.
	 */
	function scrollActiveIntoView(panel: HTMLElement): void {
		const current = active() ?? selection.current();
		if (current === undefined) return;
		const id = optionIds.get(current);
		if (id === undefined) return;
		panel
			.querySelector(`#${CSS.escape(id)}`)
			?.scrollIntoView({ block: "nearest" });
	}

	return html`<div data-slot="select" class="${() => cn("inline-flex", read(props.class))}">
		<button
			type="button"
			data-slot="select-trigger"
			id="${triggerId}"
			role="combobox"
			aria-haspopup="listbox"
			aria-expanded="${() => (open() ? "true" : "false")}"
			aria-controls="${() => (open() ? listId : undefined)}"
			aria-activedescendant="${() => {
				const current = active();
				return open() && current !== undefined
					? optionIds.get(current)
					: undefined;
			}}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			aria-required="${props.required === true ? "true" : undefined}"
			data-placeholder="${() => (selection.current() === undefined ? "" : undefined)}"
			?disabled="${() => readOr(props.disabled, false)}"
			class="${() => cn(selectTriggerClasses, read(props.class))}"
			@click="${() => {
				active(selection.current() ?? enabled()[0]?.value);
				open(!open());
			}}"
			@keydown="${onTriggerKeyDown}"
		>
			<span class="truncate"
				>${() => labelFor(selection.current()) ?? props.placeholder ?? "Select…"}</span
			>
			${ChevronDownIcon({ class: "size-4 opacity-50" })}
		</button>
		<input
			type="hidden"
			name="${props.name}"
			.value="${() => selection.current() ?? ""}"
		/>
	</div>`;
});
