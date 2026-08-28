/// <reference lib="dom" />
/**
 * The menu panel, shared by every menu-shaped surface.
 *
 * DropdownMenu, ContextMenu and Menubar differ only in what opens them — a
 * button, a right-click, a bar of buttons. The panel itself, its entries, its
 * keyboard model and its submenus are identical, and live here.
 *
 * **Entries are data.** A menu is a list, and describing it as one is what
 * lets the panel enforce things no individual item can see: which radio in a
 * group is selected, where the separators fall, and — the one that matters
 * most — that activating any item closes the whole stack, submenus included.
 *
 * **Submenus are imperative.** `floatingSurface` registers mount and unmount
 * hooks, so it can only be called from a component setup. A submenu opens from
 * inside portalled content, long after setup has run, so it wires `portal`,
 * `autoPosition` and `dismissable` directly. The stack of open submenus is
 * held here and unwound together.
 *
 * The keyboard model is the WAI-ARIA menu pattern: arrows move, Home and End
 * jump, typing seeks, ArrowRight opens a submenu, ArrowLeft closes it, Escape
 * closes one level, and activating an item closes everything.
 */

import { html, type TemplateResult } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { CheckIcon, ChevronRightIcon, DotIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { dismissable } from "../primitives/dismissable.js";
import { autoPosition } from "../primitives/floating.js";
import { focusSilently } from "../primitives/focusable.js";
import { portal } from "../primitives/portal.js";
import { rovingFocus } from "../primitives/rovingFocus.js";
import { typeahead } from "../primitives/typeahead.js";

// ─── entries ─────────────────────────────────────────────────────────

export interface MenuAction {
	type?: "item";
	label: Child;
	icon?: Child;
	/** Rendered right-aligned. Display only — bind the real shortcut yourself. */
	shortcut?: string;
	disabled?: boolean;
	/** Styles the entry as a destructive action. */
	destructive?: boolean;
	onSelect?: () => void;
}

export interface MenuCheckbox {
	type: "checkbox";
	label: Child;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

export interface MenuRadioGroup {
	type: "radio-group";
	value: string;
	options: ReadonlyArray<{ value: string; label: Child; disabled?: boolean }>;
	onValueChange?: (value: string) => void;
}

export interface MenuLabel {
	type: "label";
	label: Child;
}

export interface MenuSeparator {
	type: "separator";
}

export interface MenuSubmenu {
	type: "submenu";
	label: Child;
	icon?: Child;
	disabled?: boolean;
	entries: readonly MenuEntry[];
}

export type MenuEntry =
	| MenuAction
	| MenuCheckbox
	| MenuRadioGroup
	| MenuLabel
	| MenuSeparator
	| MenuSubmenu;

// ─── classes ─────────────────────────────────────────────────────────

export const menuPanelClasses =
	"bg-popover text-popover-foreground z-50 min-w-[8rem] max-h-(--nebula-available-height) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none";

const itemClasses =
	"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const destructiveClasses =
	"text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive";

const indentedItemClasses = `${itemClasses} py-1.5 pr-2 pl-8`;

// ─── rendering ───────────────────────────────────────────────────────

export interface MenuPanelOptions {
	id: string;
	entries: readonly MenuEntry[];
	/** Close the whole menu stack — called after an item is activated. */
	onCloseAll: () => void;
	labelledBy?: string;
	class?: string;
}

/** The panel's markup. Behaviour is attached separately by `wireMenu`. */
export function menuPanel(options: MenuPanelOptions): TemplateResult {
	return html`<div
		data-slot="menu-content"
		id="${options.id}"
		role="menu"
		aria-labelledby="${options.labelledBy}"
		aria-orientation="vertical"
		tabindex="-1"
		class="${cn(menuPanelClasses, zoomInOut, options.class)}"
	>${options.entries.map((entry) => renderEntry(entry, options.onCloseAll))}</div>`;
}

function renderEntry(entry: MenuEntry, closeAll: () => void): Child {
	if (isSeparator(entry)) {
		return html`<div role="separator" class="bg-border -mx-1 my-1 h-px"></div>`;
	}
	if (isLabel(entry)) {
		return html`<div
			role="presentation"
			class="px-2 py-1.5 text-sm font-medium text-muted-foreground"
		>${entry.label}</div>`;
	}
	if (isCheckbox(entry)) return renderCheckbox(entry, closeAll);
	if (isRadioGroup(entry)) return renderRadioGroup(entry, closeAll);
	if (isSubmenu(entry)) return renderSubmenuTrigger(entry);
	return renderAction(entry, closeAll);
}

function renderAction(entry: MenuAction, closeAll: () => void): Child {
	return html`<div
		role="menuitem"
		data-nebula-item
		data-disabled="${entry.disabled === true ? "" : undefined}"
		aria-disabled="${entry.disabled === true ? "true" : undefined}"
		tabindex="-1"
		class="${cn(itemClasses, entry.destructive === true ? destructiveClasses : "")}"
		@click="${() => activate(entry.disabled, entry.onSelect, closeAll)}"
	>
		${entry.icon}
		<span class="flex-1 truncate">${entry.label}</span>
		${
			entry.shortcut === undefined
				? null
				: html`<span class="text-muted-foreground ml-auto text-xs tracking-widest"
					>${entry.shortcut}</span
				>`
		}
	</div>`;
}

function renderCheckbox(entry: MenuCheckbox, closeAll: () => void): Child {
	return html`<div
		role="menuitemcheckbox"
		data-nebula-item
		aria-checked="${entry.checked ? "true" : "false"}"
		data-disabled="${entry.disabled === true ? "" : undefined}"
		tabindex="-1"
		class="${indentedItemClasses}"
		@click="${() =>
			activate(
				entry.disabled,
				() => entry.onCheckedChange?.(!entry.checked),
				closeAll,
			)}"
	>
		<span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
			${entry.checked ? CheckIcon({ class: "size-4" }) : null}
		</span>
		${entry.label}
	</div>`;
}

function renderRadioGroup(entry: MenuRadioGroup, closeAll: () => void): Child {
	return html`<div role="group">
		${entry.options.map(
			(option) => html`<div
				role="menuitemradio"
				data-nebula-item
				aria-checked="${option.value === entry.value ? "true" : "false"}"
				data-disabled="${option.disabled === true ? "" : undefined}"
				tabindex="-1"
				class="${indentedItemClasses}"
				@click="${() =>
					activate(
						option.disabled,
						() => entry.onValueChange?.(option.value),
						closeAll,
					)}"
			>
				<span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
					${option.value === entry.value ? DotIcon({ class: "size-2" }) : null}
				</span>
				${option.label}
			</div>`,
		)}
	</div>`;
}

/**
 * A submenu's trigger row.
 *
 * The entries are stashed on the element through a WeakMap rather than an
 * attribute — they contain callbacks and nested structures, and serialising
 * those into the DOM is not possible. `wireMenu` reads them back when the row
 * is opened.
 */
const submenuEntries = new WeakMap<Element, readonly MenuEntry[]>();

function renderSubmenuTrigger(entry: MenuSubmenu): Child {
	const id = uid("menu-sub-trigger");
	const row = html`<div
		role="menuitem"
		data-nebula-item
		data-submenu="${id}"
		data-disabled="${entry.disabled === true ? "" : undefined}"
		aria-haspopup="menu"
		aria-expanded="false"
		tabindex="-1"
		class="${itemClasses}"
	>
		${entry.icon}
		<span class="flex-1 truncate">${entry.label}</span>
		${ChevronRightIcon({ class: "ml-auto size-4" })}
	</div>`;

	pendingSubmenus.set(id, entry.entries);
	return row;
}

/**
 * Entries waiting to be claimed by their element.
 *
 * The trigger's entries are known while the template is built, but the element
 * does not exist until it is mounted. This bridges the two: `wireMenu` moves
 * each set from here onto the real element and clears the id, so nothing is
 * retained after the menu closes.
 */
const pendingSubmenus = new Map<string, readonly MenuEntry[]>();

function activate(
	disabled: boolean | undefined,
	onSelect: (() => void) | undefined,
	closeAll: () => void,
): void {
	if (disabled === true) return;
	onSelect?.();
	closeAll();
}

// ─── behaviour ───────────────────────────────────────────────────────

export interface WireMenuOptions {
	/** Close the whole stack, back to the original trigger. */
	onCloseAll: () => void;
	/** Focus the first item as soon as the panel opens. */
	autoFocusFirst?: boolean;
}

/**
 * Attach the keyboard model and submenu handling to a live panel.
 *
 * Returns a teardown that also closes any submenus still open, which is what
 * keeps a stack of three from leaving two behind when the root closes.
 */
export function wireMenu(
	panel: HTMLElement,
	options: WireMenuOptions,
): () => void {
	claimSubmenuEntries(panel);

	const open: Array<{ close(): void }> = [];

	function closeSubmenusFrom(depth: number): void {
		while (open.length > depth) open.pop()?.close();
	}

	const group = rovingFocus({
		container: () => panel,
		itemSelector: "[data-nebula-item]",
		orientation: "vertical",
		// Moving off a submenu's trigger closes it, so the pointer travelling
		// down a menu does not leave a trail of open panels behind it.
		onFocusChange: (item) => {
			if (item.getAttribute("data-submenu") === null) closeSubmenusFrom(0);
		},
		onSelect: (item) => {
			if (item.getAttribute("data-submenu") !== null) openSubmenu(item);
			else item.click();
		},
	});
	group.sync();

	const seek = typeahead({
		items: () => group.items(),
		onMatch: (item) => focusSilently(item),
	});

	function openSubmenu(trigger: HTMLElement): void {
		const entries = submenuEntries.get(trigger);
		if (entries === undefined || entries.length === 0) return;
		closeSubmenusFrom(0);

		const panelId = uid("menu-sub");
		const mount = portal(
			menuPanel({ id: panelId, entries, onCloseAll: options.onCloseAll }),
		);
		const element = mount.host.firstElementChild;
		if (!(element instanceof HTMLElement)) {
			mount.close();
			return;
		}

		element.setAttribute("data-state", "open");
		trigger.setAttribute("aria-expanded", "true");
		trigger.setAttribute("aria-controls", panelId);

		// Submenus sit beside their parent, overlapping it slightly, which is what
		// lets the pointer travel diagonally into them without crossing a gap.
		const position = autoPosition(trigger, element, {
			placement: "right-start",
			offset: -4,
		});

		const layer = dismissable({
			element: () => element,
			exclude: () => [trigger, panel],
			onDismiss: () => closeSubmenusFrom(0),
			escapeKey: false,
		});

		const inner = wireMenu(element, options);
		const firstItem = element.querySelector("[data-nebula-item]");
		if (firstItem instanceof HTMLElement) focusSilently(firstItem);

		open.push({
			close(): void {
				inner();
				layer.remove();
				position.stop();
				mount.close();
				trigger.setAttribute("aria-expanded", "false");
				trigger.removeAttribute("aria-controls");
			},
		});
	}

	function onKeyDown(event: KeyboardEvent): void {
		const active = document.activeElement;
		const inside = active instanceof Node && panel.contains(active);

		if (event.key === "ArrowRight" && inside) {
			if (!(active instanceof HTMLElement)) return;
			if (active.getAttribute("data-submenu") === null) return;
			event.preventDefault();
			event.stopPropagation();
			openSubmenu(active);
			return;
		}

		if (event.key === "ArrowLeft" && open.length > 0) {
			event.preventDefault();
			event.stopPropagation();
			closeSubmenusFrom(open.length - 1);
			return;
		}

		if (event.key === "Escape") {
			if (open.length === 0) return;
			// One level per press: a submenu three deep takes three Escapes, not
			// one. `dismissable` handles the last level, closing the root menu.
			event.preventDefault();
			event.stopPropagation();
			closeSubmenusFrom(open.length - 1);
			return;
		}

		if (event.key === "Tab") {
			// Tab out of a menu means "I am done here", not "next item".
			options.onCloseAll();
			return;
		}

		if (inside) seek.handleKey(event);
	}

	function onPointerOver(event: Event): void {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const item = target.closest("[data-nebula-item]");
		if (!(item instanceof HTMLElement)) return;
		if (item.hasAttribute("data-disabled")) return;

		focusSilently(item);
		if (item.getAttribute("data-submenu") !== null) openSubmenu(item);
	}

	panel.addEventListener("keydown", onKeyDown);
	panel.addEventListener("pointerover", onPointerOver);

	if (options.autoFocusFirst === true) {
		const first = group.items()[0];
		if (first !== undefined) focusSilently(first);
	}

	return (): void => {
		closeSubmenusFrom(0);
		panel.removeEventListener("keydown", onKeyDown);
		panel.removeEventListener("pointerover", onPointerOver);
		seek.reset();
		group.destroy();
	};
}

/** Move each submenu's entries from the build-time map onto its element. */
function claimSubmenuEntries(panel: HTMLElement): void {
	for (const node of panel.querySelectorAll("[data-submenu]")) {
		const id = node.getAttribute("data-submenu");
		if (id === null) continue;
		const entries = pendingSubmenus.get(id);
		if (entries === undefined) continue;
		submenuEntries.set(node, entries);
		pendingSubmenus.delete(id);
	}
}

// ─── entry guards ────────────────────────────────────────────────────
//
// Discriminating on an optional `type` needs real guards: `entry.type ===
// "item"` is false for a plain action, which leaves it undiscriminated. Each
// guard names the shape it accepts so the renderer narrows without a cast.

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
	return entry.type === "separator";
}

function isLabel(entry: MenuEntry): entry is MenuLabel {
	return entry.type === "label";
}

function isCheckbox(entry: MenuEntry): entry is MenuCheckbox {
	return entry.type === "checkbox";
}

function isRadioGroup(entry: MenuEntry): entry is MenuRadioGroup {
	return entry.type === "radio-group";
}

function isSubmenu(entry: MenuEntry): entry is MenuSubmenu {
	return entry.type === "submenu";
}
