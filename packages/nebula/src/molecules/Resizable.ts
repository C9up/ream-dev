/**
 * Resizable — two panes with a draggable divider.
 *
 * `react-resizable-panels`, which shadcn wraps, supports arbitrarily nested
 * groups with persisted layouts and collapse-to-zero. nebula ships the case
 * that covers almost every use of it: two panes, one handle. Nesting two of
 * these gets a three-pane layout, which is where the demand stops.
 *
 * The split is one number — the first pane's percentage — driving both panes
 * through `flex-basis`. One source of truth means the two can never disagree,
 * which is the failure mode of tracking a size per pane.
 *
 * Pointer capture on the handle is what keeps the drag alive when the pointer
 * outruns it, which it will: the handle is a few pixels wide and the pointer
 * moves faster than layout. Without capture the drag drops the moment the
 * cursor leaves.
 *
 * The handle is also a real `separator` with `aria-valuenow`, and arrow keys
 * move it. A resizable layout reachable only by dragging is unusable by
 * keyboard, and this is the whole of what it takes to fix that.
 */

import { component, html, signal } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { GripVerticalIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface ResizableProps {
	first?: Slot;
	second?: Slot;
	direction?: "horizontal" | "vertical";
	/** First pane's share at first render, in percent. Default `50`. */
	defaultSize?: number;
	minSize?: number;
	maxSize?: number;
	/** Show the grip dots on the handle. */
	withHandle?: boolean;
	class?: Reactive<string>;
	onResize?: (percent: number) => void;
}

const KEYBOARD_STEP = 5;

export const Resizable = component<ResizableProps>((props) => {
	const horizontal = props.direction !== "vertical";
	const min = props.minSize ?? 10;
	const max = props.maxSize ?? 90;
	const size = signal(clamp(props.defaultSize ?? 50, min, max));
	const rootId = uid("resizable");

	function setSize(percent: number): void {
		const next = clamp(percent, min, max);
		size(next);
		props.onResize?.(next);
	}

	/**
	 * Convert a pointer position into a percentage of the group.
	 *
	 * Measured against the group's own rect on every move rather than a rect
	 * cached at drag start: the window can be resized mid-drag, and a stale rect
	 * makes the divider drift away from the pointer.
	 */
	function percentAt(event: PointerEvent): number | null {
		const root = document.getElementById(rootId);
		if (root === null) return null;
		const rect = root.getBoundingClientRect();
		const span = horizontal ? rect.width : rect.height;
		if (span === 0) return null;
		const offset = horizontal
			? event.clientX - rect.left
			: event.clientY - rect.top;
		return (offset / span) * 100;
	}

	function onPointerDown(event: PointerEvent): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		event.preventDefault();
		target.setPointerCapture(event.pointerId);

		const onMove = (move: PointerEvent): void => {
			const percent = percentAt(move);
			if (percent !== null) setSize(percent);
		};
		const onUp = (): void => {
			target.releasePointerCapture(event.pointerId);
			target.removeEventListener("pointermove", onMove);
			target.removeEventListener("pointerup", onUp);
			target.removeEventListener("pointercancel", onUp);
		};

		target.addEventListener("pointermove", onMove);
		target.addEventListener("pointerup", onUp);
		target.addEventListener("pointercancel", onUp);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const back = horizontal ? "ArrowLeft" : "ArrowUp";
		const forward = horizontal ? "ArrowRight" : "ArrowDown";

		if (event.key === back) {
			event.preventDefault();
			setSize(size() - KEYBOARD_STEP);
		} else if (event.key === forward) {
			event.preventDefault();
			setSize(size() + KEYBOARD_STEP);
		} else if (event.key === "Home") {
			event.preventDefault();
			setSize(min);
		} else if (event.key === "End") {
			event.preventDefault();
			setSize(max);
		}
	}

	return html`<div
		data-slot="resizable-group"
		id="${rootId}"
		data-direction="${horizontal ? "horizontal" : "vertical"}"
		class="${() =>
			cn(
				"flex h-full w-full",
				horizontal ? "flex-row" : "flex-col",
				read(props.class),
			)}"
	>
		<div
			data-slot="resizable-panel"
			class="overflow-hidden"
			style="${() => `flex: 0 0 ${size()}%`}"
		>${slot(props.first)}</div>
		<div
			data-slot="resizable-handle"
			role="separator"
			tabindex="0"
			aria-orientation="${horizontal ? "vertical" : "horizontal"}"
			aria-valuemin="${min}"
			aria-valuemax="${max}"
			aria-valuenow="${() => Math.round(size())}"
			aria-label="Resize panes"
			class="${cn(
				"bg-border relative flex shrink-0 items-center justify-center outline-none",
				"focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1",
				horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
			)}"
			@pointerdown="${onPointerDown}"
			@keydown="${onKeyDown}"
		>
			${
				props.withHandle === true
					? html`<span
						class="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border"
					>${GripVerticalIcon({ class: "size-2.5" })}</span>`
					: null
			}
		</div>
		<div data-slot="resizable-panel" class="flex-1 overflow-hidden">${slot(props.second)}</div>
	</div>`;
});

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
