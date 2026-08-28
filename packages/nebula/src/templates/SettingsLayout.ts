/**
 * SettingsLayout — a section list beside a settings panel.
 *
 * The list is a real `<nav>` of links, not a Tabs component. Settings sections
 * are pages: they need their own URL so a link to "Billing" works, and so the
 * back button returns to the previous section rather than leaving the page
 * entirely. Tabs would give the same look and none of that.
 *
 * The list sits above the panel on narrow screens and beside it from `md` up,
 * which is the one responsive decision this layout has to make.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface SettingsSection {
	label: Child;
	href: string;
	active?: boolean;
}

export interface SettingsLayoutProps {
	title: Child;
	description?: Child;
	sections: readonly SettingsSection[];
	children?: Slot;
	class?: Reactive<string>;
}

export const SettingsLayout = component<SettingsLayoutProps>((props) => {
	return html`<div
		data-slot="settings-layout"
		class="${() => cn("flex flex-col gap-6 p-4 md:p-10", read(props.class))}"
	>
		<div class="flex flex-col gap-1.5">
			<h1 class="text-2xl font-semibold tracking-tight">${props.title}</h1>
			${
				props.description === undefined
					? null
					: html`<p class="text-muted-foreground text-sm">${props.description}</p>`
			}
		</div>
		<div class="flex flex-col gap-8 md:flex-row md:gap-12">
			<nav
				data-slot="settings-nav"
				aria-label="Settings sections"
				class="flex gap-2 overflow-x-auto md:w-48 md:shrink-0 md:flex-col md:overflow-visible"
			>
				${props.sections.map(
					(section) => html`<a
						href="${section.href}"
						aria-current="${section.active === true ? "page" : undefined}"
						class="hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors"
					>${section.label}</a>`,
				)}
			</nav>
			<div data-slot="settings-panel" class="min-w-0 flex-1">${slot(props.children)}</div>
		</div>
	</div>`;
});
