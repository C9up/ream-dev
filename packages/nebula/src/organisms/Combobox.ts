/**
 * Combobox — a select you can type into.
 *
 * Structurally a Select whose panel holds a search field, which is exactly how
 * shadcn builds it (a Popover wrapping a Command). nebula does the same, so
 * the filtering, the highlight and the keyboard model are `Command`'s and are
 * not written twice.
 *
 * The one addition over Command is selection: a combobox remembers what was
 * picked, shows it on the trigger, and posts it with the form. Command runs an
 * action and forgets.
 *
 * Focus moves into the panel's search field on open — that is the point of the
 * control — and returns to the trigger on close, so the tab order does not
 * jump to the top of the page after choosing.
 */

import { component, html, signal } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { ChevronsUpDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";
import { Command, type CommandItem } from "./Command.js";
import { selectTriggerClasses } from "./Select.js";

export interface ComboboxOption {
	value: string;
	label: string;
	keywords?: readonly string[];
	disabled?: boolean;
	group?: string;
}

export interface ComboboxProps {
	options: readonly ComboboxOption[];
	name?: string;
	value?: Reactive<string | undefined>;
	defaultValue?: string;
	/** Trigger text when nothing is chosen. */
	placeholder?: string;
	/** Placeholder inside the search field. */
	searchPlaceholder?: string;
	emptyMessage?: string;
	disabled?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
	onValueChange?: (value: string) => void;
}

export const Combobox = component<ComboboxProps>((props) => {
	const triggerId = uid("combobox-trigger");
	const contentId = uid("combobox-content");
	const open = signal(false);

	const selection = controllable<string | undefined>({
		value: props.value,
		initial: props.defaultValue,
		onChange: (next) => {
			if (next !== undefined) props.onValueChange?.(next);
		},
	});

	function labelFor(value: string | undefined): string | undefined {
		return props.options.find((option) => option.value === value)?.label;
	}

	const items = (): readonly CommandItem[] =>
		props.options.map((option) => ({
			value: option.value,
			label: option.label,
			keywords: option.keywords,
			disabled: option.disabled,
			group: option.group,
		}));

	function choose(item: CommandItem): void {
		selection.set(item.value);
		open(false);
		focusSilently(document.getElementById(triggerId));
	}

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => open(false),
		placement: "bottom-start",
		offset: 4,
		matchWidth: true,
		trapFocus: true,
		// Focus the search field, not the first result — the user opened this to
		// type. `firstFocusable` would land on whichever element comes first in
		// the DOM, which is only the input by accident.
		initialFocus: (content) => content.querySelector("input"),
		content: () =>
			html`<div
				data-slot="combobox-content"
				id="${contentId}"
				class="${cn(
					"bg-popover text-popover-foreground z-50 min-w-(--nebula-anchor-width) overflow-hidden rounded-md border shadow-md",
					zoomInOut,
					read(props.contentClass),
				)}"
			>
				${Command({
					items: items(),
					placeholder: props.searchPlaceholder ?? "Search…",
					emptyMessage: props.emptyMessage ?? "No results found.",
					onSelect: choose,
				})}
			</div>`,
	});

	return html`<div data-slot="combobox" class="${() => cn("inline-flex", read(props.class))}">
		<button
			type="button"
			data-slot="combobox-trigger"
			id="${triggerId}"
			role="combobox"
			aria-haspopup="listbox"
			aria-expanded="${() => (open() ? "true" : "false")}"
			aria-controls="${() => (open() ? contentId : undefined)}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			data-placeholder="${() => (selection.current() === undefined ? "" : undefined)}"
			?disabled="${() => readOr(props.disabled, false)}"
			class="${() => cn(selectTriggerClasses, "justify-between")}"
			@click="${() => open(!open())}"
		>
			<span class="truncate"
				>${() => labelFor(selection.current()) ?? props.placeholder ?? "Select…"}</span
			>
			${ChevronsUpDownIcon({ class: "size-4 opacity-50" })}
		</button>
		<input type="hidden" name="${props.name}" .value="${() => selection.current() ?? ""}" />
	</div>`;
});
