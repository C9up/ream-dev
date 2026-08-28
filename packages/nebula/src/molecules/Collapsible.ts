/**
 * Collapsible — a trigger that shows and hides a panel.
 *
 * Two things differ from Radix, both deliberate.
 *
 * **The API.** Radix composes through React context: `<Collapsible>` publishes
 * state that `<CollapsibleTrigger>` and `<CollapsibleContent>` read from
 * anywhere below it. Aurora has no context, and the usual workarounds — a
 * factory returning bound parts, or threading a handle through props — trade a
 * real problem for a clumsier one. So the parts are props: `trigger` and
 * `children`. The rendered markup is identical to shadcn's; only the call
 * shape changes.
 *
 * **The animation.** Radix measures the content and publishes its height as
 * `--radix-collapsible-content-height` for the keyframes to interpolate,
 * because `height: auto` is not animatable. A CSS grid whose single row goes
 * from `0fr` to `1fr` animates the same transition with no measurement, no
 * resize observer, and no stale height when the content changes while closed.
 *
 * The closed panel stays in the DOM — that is what makes the transition
 * possible — so it is marked `inert`. Without it the panel keeps its tab stops
 * and stays in the accessibility tree, and a keyboard user tabs into content
 * that is not on screen.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";

export interface CollapsibleProps {
	/** The clickable summary. Rendered inside a button. */
	trigger?: Slot;
	/** The panel revealed when open. */
	children?: Slot;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	disabled?: Reactive<boolean>;
	onOpenChange?: (open: boolean) => void;
	class?: Reactive<string>;
	triggerClass?: Reactive<string>;
	contentClass?: Reactive<string>;
}

export const Collapsible = component<CollapsibleProps>((props) => {
	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	const contentId = uid("collapsible-content");
	const triggerId = uid("collapsible-trigger");

	const toggle = (): void => {
		if (readOr(props.disabled, false)) return;
		state.set(!state.current());
	};

	return html`<div
		data-slot="collapsible"
		data-state="${() => (state.current() ? "open" : "closed")}"
		class="${() => cn("flex flex-col", read(props.class))}"
	>
		<button
			type="button"
			data-slot="collapsible-trigger"
			id="${triggerId}"
			aria-expanded="${() => (state.current() ? "true" : "false")}"
			aria-controls="${contentId}"
			?disabled="${() => readOr(props.disabled, false)}"
			class="${() => cn("flex items-center justify-between gap-2 outline-none disabled:opacity-50", read(props.triggerClass))}"
			@click="${toggle}"
		>${slot(props.trigger)}</button>
		<div
			data-slot="collapsible-content"
			id="${contentId}"
			role="region"
			aria-labelledby="${triggerId}"
			?inert="${() => !state.current()}"
			class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
			style="${() => `grid-template-rows: ${state.current() ? "1fr" : "0fr"}`}"
		>
			<div class="${() => cn("overflow-hidden", read(props.contentClass))}">${slot(props.children)}</div>
		</div>
	</div>`;
});
