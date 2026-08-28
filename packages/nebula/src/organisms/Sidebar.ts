/**
 * Sidebar — the application shell's navigation column.
 *
 * Two presentations from one definition, because a sidebar is not a component
 * so much as a layout decision that changes with the viewport:
 *
 * - On a wide screen it is a column beside the content, collapsible to a strip
 *   of icons or away entirely.
 * - On a narrow one it is a Sheet. A 16rem column on a phone leaves nothing
 *   for the content, and every attempt to keep it visible ends up as a drawer
 *   anyway.
 *
 * The collapsed state is persisted in a cookie rather than `localStorage`. The
 * server renders the shell, and only a cookie is readable there — with
 * `localStorage` the sidebar renders expanded, then snaps shut once the client
 * hydrates, which is visible on every page load.
 *
 * `cmd/ctrl + B` toggles it, the convention from every editor that has one.
 */

import {
	booleanCookie,
	component,
	cookieState,
	html,
	onMount,
	onUnmount,
	signal,
} from "@c9up/aurora";
import { Button } from "../atoms/Button.js";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { PanelLeftIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";
import { Sheet } from "./Sheet.js";

const COOKIE_NAME = "nebula:sidebar";
const COOKIE_MAX_AGE_DAYS = 365;
/** Below this width the sidebar becomes a Sheet. Matches Tailwind's `md`. */
const MOBILE_BREAKPOINT = 768;

export interface SidebarProps {
	children?: Slot;
	header?: Slot;
	footer?: Slot;
	/** Which edge. Default `"left"`. */
	side?: "left" | "right";
	/** What collapsing does: shrink to icons, or disappear. Default `"icon"`. */
	collapsible?: "icon" | "offcanvas";
	/** Starting state. Read from the cookie when there is one. */
	defaultOpen?: boolean;
	/** Announced as the navigation landmark's name. */
	label?: string;
	class?: Reactive<string>;
}

export const Sidebar = component<SidebarProps>((props) => {
	const side = props.side ?? "left";
	const collapsible = props.collapsible ?? "icon";
	// Aurora's `cookieState` is a signal that mirrors itself into a cookie, and
	// reads from the SSR seed on the server. Writing `document.cookie` by hand
	// here would work in the browser and silently do nothing during SSR, which
	// is the half that matters — the server has to know the width to render.
	const open = cookieState(
		COOKIE_NAME,
		props.defaultOpen ?? true,
		booleanCookie,
		{
			path: "/",
			maxAge: COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
			sameSite: "lax",
		},
	);
	const mobile = signal(false);

	function toggle(): void {
		open(!open());
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== "b" && event.key !== "B") return;
		if (!event.metaKey && !event.ctrlKey) return;
		event.preventDefault();
		toggle();
	}

	// `matchMedia` rather than a resize listener: it fires only when the
	// breakpoint is actually crossed, not on every pixel of a window drag.
	let media: MediaQueryList | undefined;
	function syncMobile(): void {
		mobile(media?.matches === true);
	}

	onMount(() => {
		media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		syncMobile();
		media.addEventListener("change", syncMobile);
		document.addEventListener("keydown", onKeyDown);
	});

	onUnmount(() => {
		media?.removeEventListener("change", syncMobile);
		document.removeEventListener("keydown", onKeyDown);
	});

	const body = (): Child =>
		html`<div data-slot="sidebar-inner" class="flex h-full w-full flex-col">
			${
				props.header === undefined
					? null
					: html`<div data-slot="sidebar-header" class="flex flex-col gap-2 p-2">
						${slot(props.header)}
					</div>`
			}
			<div data-slot="sidebar-body" class="min-h-0 flex-1 overflow-auto p-2">
				${slot(props.children)}
			</div>
			${
				props.footer === undefined
					? null
					: html`<div data-slot="sidebar-footer" class="flex flex-col gap-2 p-2">
						${slot(props.footer)}
					</div>`
			}
		</div>`;

	return html`<div data-slot="sidebar-root">
		${() =>
			mobile()
				? Sheet({
						title: props.label ?? "Navigation",
						srOnlyTitle: true,
						side,
						open: () => open(),
						onOpenChange: (next) => open(next),
						children: body(),
						contentClass: "bg-sidebar text-sidebar-foreground w-[18rem] p-0",
					})
				: html`<nav
						data-slot="sidebar"
						data-state="${() => (open() ? "expanded" : "collapsed")}"
						data-side="${side}"
						data-collapsible="${collapsible}"
						aria-label="${props.label ?? "Sidebar"}"
						class="${() =>
							cn(
								"bg-sidebar text-sidebar-foreground h-svh shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none",
								side === "left" ? "border-r" : "border-l",
								open()
									? "w-(--sidebar-width,16rem)"
									: collapsible === "icon"
										? "w-(--sidebar-width-icon,3rem)"
										: "w-0 border-0",
								read(props.class),
							)}"
					>${body()}</nav>`}
	</div>`;
});

export interface SidebarTriggerProps {
	onToggle: () => void;
	class?: Reactive<string>;
}

/**
 * The button that opens and closes the sidebar.
 *
 * Kept apart from `Sidebar` because it belongs in the page header, not in the
 * panel — a trigger inside an off-canvas sidebar disappears with it, and there
 * is then no way back.
 */
export const SidebarTrigger = component<SidebarTriggerProps>((props) => {
	return Button({
		variant: "ghost",
		size: "icon",
		label: "Toggle sidebar",
		class: props.class,
		onClick: props.onToggle,
		children: PanelLeftIcon({ class: "size-4" }),
	});
});

export const SidebarGroup = styledDiv(
	"sidebar-group",
	"flex w-full flex-col gap-1 p-2",
);

export const SidebarGroupLabel = styledDiv(
	"sidebar-group-label",
	"text-sidebar-foreground/70 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium",
);

export const SidebarMenu = styledDiv(
	"sidebar-menu",
	"flex w-full min-w-0 flex-col gap-1",
);

export interface SidebarMenuItemProps {
	label: Child;
	href?: string;
	icon?: Child;
	active?: Reactive<boolean>;
	onClick?: () => void;
}

/**
 * One navigation entry.
 *
 * `aria-current="page"` on the active entry, not just a highlight class. The
 * highlight tells a sighted user where they are; without the attribute nobody
 * else is told at all.
 */
export const SidebarMenuItem = component<SidebarMenuItemProps>((props) => {
	const classes =
		"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0";

	if (props.href !== undefined) {
		return html`<a
			data-slot="sidebar-menu-item"
			href="${props.href}"
			aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
			class="${classes}"
		>${props.icon}<span class="truncate">${props.label}</span></a>`;
	}

	return html`<button
		type="button"
		data-slot="sidebar-menu-item"
		aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
		class="${classes}"
		@click="${props.onClick}"
	>${props.icon}<span class="truncate">${props.label}</span></button>`;
});
