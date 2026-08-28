/**
 * Kbd — a keyboard key rendered inline.
 *
 * Used by Command and by menu items showing their shortcut. Kept as an atom
 * rather than baked into those two, because shortcut hints show up in tooltips
 * and documentation prose as well.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface KbdProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const Kbd = component<KbdProps>((props) => {
	return html`<kbd
		data-slot="kbd"
		class="${() =>
			cn(
				"bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium",
				read(props.class),
			)}"
	>${slot(props.children)}</kbd>`;
});
