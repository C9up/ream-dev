/**
 * AppShell — sidebar, header, content.
 *
 * The layout behind almost every signed-in page. Shipping it is what makes
 * nebula an atomic-design library rather than a component bag: shadcn stops at
 * organisms and leaves the page skeleton to be rebuilt per app, which is why
 * two pages in the same product end up with different header heights.
 *
 * `h-svh` on the shell and `overflow-auto` on the content column, not on the
 * body. That is what keeps the header and the sidebar fixed while only the
 * content scrolls — pinning them with `position: fixed` instead means
 * hand-maintaining a top padding that matches the header, and it breaks the
 * moment the header wraps to two lines.
 *
 * `svh` rather than `vh` because mobile browsers shrink the viewport as their
 * address bar retracts; `vh` leaves the last hundred pixels of a full-height
 * layout under the browser chrome.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface AppShellProps {
	/** The navigation column — usually a `Sidebar`. */
	sidebar?: Slot;
	/** The top bar, spanning the content column. */
	header?: Slot;
	children?: Slot;
	class?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const AppShell = component<AppShellProps>((props) => {
	return html`<div
		data-slot="app-shell"
		class="${() => cn("bg-background flex h-svh w-full overflow-hidden", read(props.class))}"
	>
		${slot(props.sidebar)}
		<div data-slot="app-shell-main" class="flex min-w-0 flex-1 flex-col">
			${
				props.header === undefined
					? null
					: html`<header
						data-slot="app-shell-header"
						class="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4"
					>${slot(props.header)}</header>`
			}
			<main
				data-slot="app-shell-content"
				class="${() => cn("min-h-0 flex-1 overflow-auto p-4 md:p-6", read(props.contentClass))}"
			>${slot(props.children)}</main>
		</div>
	</div>`;
});
