/**
 * Tabs — one panel visible at a time.
 *
 * The WAI-ARIA tabs pattern in full: the tab list is a single tab stop with
 * arrows moving between tabs, each tab points at its panel with
 * `aria-controls`, and each panel points back with `aria-labelledby`.
 *
 * Activation is automatic — moving to a tab selects it — which is the right
 * default when panels are already rendered and switching costs nothing. The
 * `activateOnFocus: false` escape hatch exists for panels that fetch on
 * display, where arrowing past three tabs would fire three requests.
 *
 * Hidden panels stay mounted so a form or a scroll position inside one
 * survives a trip to another tab. `hidden` keeps them out of the layout and
 * the accessibility tree, which is the behaviour `display: none` would give
 * without also removing them from the DOM.
 */

import { component, html, onMount, onUnmount, signal } from "@c9up/aurora";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { type RovingFocus, rovingFocus } from "../primitives/rovingFocus.js";

export interface TabItem {
	value: string;
	label: Child;
	content: Slot;
	disabled?: boolean;
}

export interface TabsProps {
	items: readonly TabItem[];
	/** Selected at first render. Defaults to the first enabled tab. */
	defaultValue?: string;
	orientation?: "horizontal" | "vertical";
	/** Selecting follows focus. Default `true`. */
	activateOnFocus?: boolean;
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
	listClass?: Reactive<string>;
}

export const Tabs = component<TabsProps>((props) => {
	const orientation = props.orientation ?? "horizontal";
	const first = props.items.find((item) => item.disabled !== true);
	const active = signal(props.defaultValue ?? first?.value ?? "");
	const listId = uid("tabs-list");

	// Ids are minted once per tab, up front, because a tab and its panel each
	// need to name the other — one of them has to know both before rendering.
	const ids = new Map<string, { tab: string; panel: string }>();
	for (const item of props.items) {
		ids.set(item.value, { tab: uid("tab"), panel: uid("tab-panel") });
	}

	function select(value: string): void {
		if (active() === value) return;
		active(value);
		props.onValueChange?.(value);
	}

	let group: RovingFocus | undefined;
	onMount(() => {
		group = rovingFocus({
			container: () => document.getElementById(listId),
			itemSelector: "[role='tab']",
			orientation,
			onFocusChange: (item) => {
				if (props.activateOnFocus === false) return;
				const value = item.getAttribute("data-value");
				if (value !== null) select(value);
			},
			onSelect: (item) => {
				const value = item.getAttribute("data-value");
				if (value !== null) select(value);
			},
		});
		group.sync();
	});
	onUnmount(() => group?.destroy());

	return html`<div
		data-slot="tabs"
		data-orientation="${orientation}"
		class="${() => cn("flex gap-2", orientation === "vertical" ? "flex-row" : "flex-col", read(props.class))}"
	>
		<div
			role="tablist"
			data-slot="tabs-list"
			id="${listId}"
			aria-orientation="${orientation}"
			class="${() =>
				cn(
					"bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-[3px]",
					orientation === "vertical" ? "flex-col" : "h-9",
					read(props.listClass),
				)}"
		>
			${props.items.map((item) => renderTab(item, ids, active, select))}
		</div>
		${props.items.map((item) => renderPanel(item, ids, active))}
	</div>`;
});

function renderTab(
	item: TabItem,
	ids: ReadonlyMap<string, { tab: string; panel: string }>,
	active: () => string,
	select: (value: string) => void,
): Child {
	const id = ids.get(item.value);
	const selected = (): boolean => active() === item.value;

	return html`<button
		type="button"
		role="tab"
		data-slot="tabs-trigger"
		data-value="${item.value}"
		data-state="${() => (selected() ? "active" : "inactive")}"
		data-disabled="${item.disabled === true ? "" : undefined}"
		id="${id?.tab}"
		aria-selected="${() => (selected() ? "true" : "false")}"
		aria-controls="${id?.panel}"
		?disabled="${item.disabled === true}"
		class="data-[state=active]:bg-background data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
		@click="${() => select(item.value)}"
	>${item.label}</button>`;
}

function renderPanel(
	item: TabItem,
	ids: ReadonlyMap<string, { tab: string; panel: string }>,
	active: () => string,
): Child {
	const id = ids.get(item.value);
	return html`<div
		role="tabpanel"
		data-slot="tabs-content"
		id="${id?.panel}"
		aria-labelledby="${id?.tab}"
		tabindex="0"
		?hidden="${() => active() !== item.value}"
		class="flex-1 outline-none"
	>${slot(item.content)}</div>`;
}
