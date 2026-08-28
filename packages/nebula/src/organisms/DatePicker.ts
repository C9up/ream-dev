/**
 * DatePicker — a Calendar in a popover, behind a button.
 *
 * shadcn composes this out of Popover, Button and Calendar rather than
 * shipping it; nebula ships it, because the composition has three details that
 * are easy to get wrong and pointless to rediscover per project.
 *
 * The popover closes on selection — a date picker that stays open after a
 * choice leaves the user hunting for the way out. Focus returns to the
 * trigger, so the tab order does not restart at the top of the page. And the
 * trigger reads the chosen date through `Intl.DateTimeFormat`, so it renders
 * in the user's locale rather than an American ordering everyone else has to
 * decode.
 *
 * A hidden input carries the value as ISO `YYYY-MM-DD`, which is what a server
 * wants — never the localised string on the button.
 */

import { component, html, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import { cn } from "../lib/cn.js";
import { CalendarIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";
import { Calendar, startOfDay } from "./Calendar.js";

export interface DatePickerProps {
	name?: string;
	value?: Reactive<Date | undefined>;
	defaultValue?: Date;
	placeholder?: string;
	min?: Date;
	max?: Date;
	disabled?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	locale?: string;
	class?: Reactive<string>;
	onValueChange?: (date: Date) => void;
}

/** `YYYY-MM-DD` from a local date, without a timezone round-trip. */
export function toISODate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export const DatePicker = component<DatePickerProps>((props) => {
	const triggerId = uid("date-picker-trigger");
	const contentId = uid("date-picker-content");
	const open = signal(false);

	const selection = controllable<Date | undefined>({
		value: props.value,
		initial: props.defaultValue,
		onChange: (next) => {
			if (next !== undefined) props.onValueChange?.(next);
		},
	});

	const format = new Intl.DateTimeFormat(props.locale, { dateStyle: "medium" });

	function choose(date: Date): void {
		selection.set(startOfDay(date));
		open(false);
		focusSilently(document.getElementById(triggerId));
	}

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => open(false),
		placement: "bottom-start",
		offset: 4,
		trapFocus: true,
		// The cursor cell, not the first focusable — landing on the previous-month
		// arrow means the first arrow key pages the calendar instead of moving a
		// day, which is not what a keyboard user reaching a date grid expects.
		initialFocus: (content) => content.querySelector("[data-cursor]"),
		content: () =>
			html`<div
				data-slot="date-picker-content"
				id="${contentId}"
				role="dialog"
				aria-label="Choose a date"
				class="${cn(
					"bg-popover text-popover-foreground z-50 rounded-md border p-0 shadow-md outline-none",
					zoomInOut,
				)}"
			>
				${Calendar({
					value: () => selection.current(),
					defaultMonth: selection.current(),
					min: props.min,
					max: props.max,
					locale: props.locale,
					onValueChange: choose,
				})}
			</div>`,
	});

	return html`<div data-slot="date-picker" class="${() => cn("inline-flex", read(props.class))}">
		<button
			type="button"
			id="${triggerId}"
			data-slot="date-picker-trigger"
			aria-haspopup="dialog"
			aria-expanded="${() => (open() ? "true" : "false")}"
			aria-controls="${() => (open() ? contentId : undefined)}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			data-placeholder="${() => (selection.current() === undefined ? "" : undefined)}"
			?disabled="${() => readOr(props.disabled, false)}"
			class="${buttonVariants({
				variant: "outline",
				class:
					"w-full justify-start gap-2 font-normal data-[placeholder]:text-muted-foreground",
			})}"
			@click="${() => open(!open())}"
		>
			${CalendarIcon({ class: "size-4" })}
			<span>${() => {
				const current = selection.current();
				return current === undefined
					? (props.placeholder ?? "Pick a date")
					: format.format(current);
			}}</span>
		</button>
		<input
			type="hidden"
			name="${props.name}"
			.value="${() => {
				const current = selection.current();
				return current === undefined ? "" : toISODate(current);
			}}"
		/>
	</div>`;
});
