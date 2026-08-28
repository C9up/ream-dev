/**
 * Accordion — a stack of collapsible sections.
 *
 * Data-driven rather than composed: an accordion is a list, and describing it
 * as one is both shorter to write and the only shape that lets the group
 * enforce `type: "single"` — which needs to know about every section at once,
 * something Radix can only do through context.
 *
 * The keyboard behaviour is the WAI-ARIA accordion pattern, delegated to
 * `rovingFocus` over the headers: arrows move between sections, Home and End
 * jump to the ends, and the headers are one tab stop rather than one each.
 */

import { component, html, onMount, onUnmount, signal } from "@c9up/aurora";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { type RovingFocus, rovingFocus } from "../primitives/rovingFocus.js";

export interface AccordionItem {
	/** Stable key. Used for the open-state set and for the ARIA ids. */
	value: string;
	/** The header content. */
	trigger: Child;
	/** The panel content. */
	content: Slot;
	disabled?: boolean;
}

export interface AccordionProps {
	items: readonly AccordionItem[];
	/** `"single"` closes the open section when another opens. Default `"single"`. */
	type?: "single" | "multiple";
	/** Open at first render. A string, or several for `type: "multiple"`. */
	defaultValue?: string | readonly string[];
	/** `"single"` accordions can normally be closed entirely. */
	collapsible?: boolean;
	onValueChange?: (open: readonly string[]) => void;
	class?: Reactive<string>;
}

export const Accordion = component<AccordionProps>((props) => {
	const type = props.type ?? "single";
	const open = signal<readonly string[]>(normaliseInitial(props.defaultValue));
	const rootId = uid("accordion");

	function isOpen(value: string): boolean {
		return open().includes(value);
	}

	function toggle(value: string): void {
		const current = open();
		const next = nextOpenSet(current, value, type, props.collapsible !== false);
		open(next);
		props.onValueChange?.(next);
	}

	// Roving focus is attached after mount because it queries the container for
	// its items, and the container does not exist until then.
	let group: RovingFocus | undefined;
	onMount(() => {
		group = rovingFocus({
			container: () => document.getElementById(rootId),
			itemSelector: "[data-slot='accordion-trigger']",
			orientation: "vertical",
		});
		group.sync();
	});
	onUnmount(() => group?.destroy());

	return html`<div
		data-slot="accordion"
		id="${rootId}"
		class="${() => cn("flex w-full flex-col", read(props.class))}"
	>
		${props.items.map((item) => renderItem(item, isOpen, toggle))}
	</div>`;
});

function renderItem(
	item: AccordionItem,
	isOpen: (value: string) => boolean,
	toggle: (value: string) => void,
): Child {
	const triggerId = uid("accordion-trigger");
	const panelId = uid("accordion-panel");
	const state = (): string => (isOpen(item.value) ? "open" : "closed");

	return html`<div
		data-slot="accordion-item"
		data-state="${state}"
		class="border-b last:border-b-0"
	>
		<h3 class="flex">
			<button
				type="button"
				data-slot="accordion-trigger"
				data-nebula-item
				data-state="${state}"
				data-disabled="${item.disabled === true ? "" : undefined}"
				id="${triggerId}"
				aria-expanded="${() => (isOpen(item.value) ? "true" : "false")}"
				aria-controls="${panelId}"
				?disabled="${item.disabled === true}"
				class="focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-all hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180"
				@click="${() => toggle(item.value)}"
			>
				${item.trigger}
				${ChevronDownIcon({
					class:
						"text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200",
				})}
			</button>
		</h3>
		<div
			data-slot="accordion-content"
			id="${panelId}"
			role="region"
			aria-labelledby="${triggerId}"
			?inert="${() => !isOpen(item.value)}"
			class="grid text-sm transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
			style="${() => `grid-template-rows: ${isOpen(item.value) ? "1fr" : "0fr"}`}"
		>
			<div class="overflow-hidden"><div class="pt-0 pb-4">${slot(item.content)}</div></div>
		</div>
	</div>`;
}

function normaliseInitial(
	value: string | readonly string[] | undefined,
): readonly string[] {
	if (value === undefined) return [];
	return typeof value === "string" ? [value] : value;
}

/**
 * The open set after activating `value`.
 *
 * `collapsible: false` on a single accordion is what stops the last open
 * section from closing — the pattern used when one section must always be
 * showing, and the reason this is not simply a toggle.
 */
function nextOpenSet(
	current: readonly string[],
	value: string,
	type: "single" | "multiple",
	collapsible: boolean,
): readonly string[] {
	const isOpen = current.includes(value);

	if (type === "multiple") {
		return isOpen
			? current.filter((entry) => entry !== value)
			: [...current, value];
	}
	if (isOpen) return collapsible ? [] : current;
	return [value];
}
