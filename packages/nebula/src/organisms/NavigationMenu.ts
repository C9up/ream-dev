/**
 * NavigationMenu — a site navigation bar with drop-down panels.
 *
 * Not a menu, despite the name Radix gave it, and the distinction changes the
 * markup. A menu is a list of *commands*; this is a list of *links*. So it is
 * a `<nav>` containing a list of anchors, with `aria-expanded` on the entries
 * that open a panel — never `role="menu"`, which would have a screen reader
 * announce a navigation bar as an application menu and offer the wrong
 * shortcuts for it.
 *
 * Entries are either a plain link or a link with a panel. Hover opens a panel
 * after a short delay and keeps it open briefly on leave, because the pointer
 * has to travel from the trigger to the panel and a naive `mouseleave` closes
 * it in the gap between them.
 *
 * Every panel is reachable by keyboard: the trigger is a real button, Enter
 * and ArrowDown open it, Escape closes it and returns focus.
 */

import { component, html, onUnmount, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 250;

export interface NavigationLink {
	label: Child;
	href: string;
	description?: Child;
}

export interface NavigationItem {
	label: Child;
	/** A plain link. Mutually exclusive with `links` / `content`. */
	href?: string;
	/** A panel of links, laid out in a grid. */
	links?: readonly NavigationLink[];
	/** Arbitrary panel content, when a link grid is not enough. */
	content?: Slot;
}

export interface NavigationMenuProps {
	items: readonly NavigationItem[];
	class?: Reactive<string>;
}

export const triggerClasses =
	"group inline-flex h-9 w-max items-center justify-center gap-1 rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent/50";

export const NavigationMenu = component<NavigationMenuProps>((props) => {
	const contentId = uid("navigation-menu-content");
	const triggerIds = props.items.map(() => uid("navigation-menu-trigger"));
	const openIndex = signal(-1);

	let timer: ReturnType<typeof setTimeout> | undefined;

	function clear(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function schedule(index: number, delay: number): void {
		clear();
		timer = setTimeout(() => openIndex(index), delay);
	}

	onUnmount(clear);

	function close(returnFocus: boolean): void {
		clear();
		const index = openIndex();
		openIndex(-1);
		if (!returnFocus) return;
		const id = triggerIds[index];
		if (id !== undefined) focusSilently(document.getElementById(id));
	}

	floatingSurface({
		anchor: () => {
			const id = triggerIds[openIndex()];
			return id === undefined ? null : document.getElementById(id);
		},
		open: () => openIndex() !== -1,
		onClose: () => close(false),
		placement: "bottom-start",
		offset: 6,
		content: () =>
			html`<div
				data-slot="navigation-menu-content"
				id="${contentId}"
				class="${cn(
					"bg-popover text-popover-foreground z-50 rounded-md border p-4 shadow-md outline-none",
					zoomInOut,
				)}"
				@pointerenter="${clear}"
				@pointerleave="${() => schedule(-1, CLOSE_DELAY_MS)}"
				@keydown="${(event: KeyboardEvent) => {
					if (event.key === "Escape") close(true);
				}}"
			>${renderPanel(props.items[openIndex()])}</div>`,
	});

	return html`<nav
		data-slot="navigation-menu"
		class="${() => cn("relative flex max-w-max flex-1 items-center justify-center", read(props.class))}"
	>
		<ul class="flex flex-1 list-none items-center justify-center gap-1">
			${props.items.map((item, index) => renderEntry(item, index))}
		</ul>
	</nav>`;

	function renderEntry(item: NavigationItem, index: number): Child {
		if (item.href !== undefined) {
			return html`<li>
				<a
					href="${item.href}"
					data-slot="navigation-menu-link"
					class="${triggerClasses}"
					@pointerenter="${() => {
						// Hovering a plain link while a panel is open closes it: the
						// pointer has left the panel's branch of the bar.
						if (openIndex() !== -1) schedule(-1, CLOSE_DELAY_MS);
					}}"
				>${item.label}</a>
			</li>`;
		}

		return html`<li>
			<button
				type="button"
				id="${triggerIds[index]}"
				data-slot="navigation-menu-trigger"
				aria-expanded="${() => (openIndex() === index ? "true" : "false")}"
				aria-controls="${() => (openIndex() === index ? contentId : undefined)}"
				data-state="${() => (openIndex() === index ? "open" : "closed")}"
				class="${triggerClasses}"
				@click="${() => (openIndex() === index ? close(false) : openIndex(index))}"
				@pointerenter="${() => schedule(index, OPEN_DELAY_MS)}"
				@pointerleave="${() => schedule(-1, CLOSE_DELAY_MS)}"
				@keydown="${(event: KeyboardEvent) => {
					if (
						event.key === "ArrowDown" ||
						event.key === "Enter" ||
						event.key === " "
					) {
						event.preventDefault();
						openIndex(index);
					}
				}}"
			>
				${item.label}
				${ChevronDownIcon({
					class:
						"relative top-px size-3 transition-transform duration-200 group-data-[state=open]:rotate-180",
				})}
			</button>
		</li>`;
	}
});

function renderPanel(item: NavigationItem | undefined): Child {
	if (item === undefined) return null;
	if (item.content !== undefined) return slot(item.content)();

	return html`<ul class="grid w-[400px] gap-1 md:w-[500px] md:grid-cols-2">
		${(item.links ?? []).map(
			(link) => html`<li>
				<a
					href="${link.href}"
					class="hover:bg-accent hover:text-accent-foreground focus:bg-accent block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors"
				>
					<div class="text-sm leading-none font-medium">${link.label}</div>
					${
						link.description === undefined
							? null
							: html`<p class="text-muted-foreground line-clamp-2 text-sm leading-snug">
								${link.description}
							</p>`
					}
				</a>
			</li>`,
		)}
	</ul>`;
}
