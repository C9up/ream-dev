/**
 * Calendar — a month grid for picking a date.
 *
 * shadcn wraps `react-day-picker`, which brings `date-fns` with it. nebula
 * uses `Date` and `Intl`, which cover everything this needs: month lengths and
 * leap years come from `Date`, and weekday and month names come from
 * `Intl.DateTimeFormat` in the user's locale for free — which is more than a
 * hardcoded English array would give.
 *
 * Dates are handled at local midnight throughout. A calendar cell means "this
 * day", not "this instant", and mixing the two is how a date picker ends up
 * off by one for users west of UTC: `new Date("2026-03-14")` parses as UTC
 * midnight, which is the 13th in New York.
 *
 * The keyboard model is the WAI-ARIA grid pattern, and it is what makes the
 * control usable at all without a pointer: arrows move a day, PageUp/PageDown
 * move a month, Home and End jump to the ends of the week. Only one cell is
 * ever tabbable — the focused day — so Tab leaves the grid instead of walking
 * through thirty-one buttons.
 */

import { component, html, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronLeftIcon, ChevronRightIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface CalendarProps {
	/** Selected day. Local midnight. */
	value?: Reactive<Date | undefined>;
	defaultValue?: Date;
	/** Month shown at first render. Defaults to the selection, then today. */
	defaultMonth?: Date;
	min?: Date;
	max?: Date;
	/** Rule out individual days — weekends, holidays, taken slots. */
	disabled?: (date: Date) => boolean;
	/** `0` Sunday, `1` Monday. Defaults to the locale's own first day. */
	weekStartsOn?: number;
	locale?: string;
	class?: Reactive<string>;
	onValueChange?: (date: Date) => void;
}

// ─── date helpers ────────────────────────────────────────────────────

/** Local midnight of the given day — the canonical form for a calendar date. */
export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function addDays(date: Date, days: number): Date {
	// Day-of-month arithmetic through the Date constructor, which normalises
	// overflow — the 32nd of March becomes the 1st of April, leap years and
	// month lengths included. Adding milliseconds would not: a day is not
	// always 86 400 000 ms across a daylight-saving boundary.
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
	const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
	// Clamp the day: 31 January plus one month is 28 February, not 3 March.
	const lastDay = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0,
	).getDate();
	return new Date(
		target.getFullYear(),
		target.getMonth(),
		Math.min(date.getDate(), lastDay),
	);
}

/**
 * The six-week grid covering a month.
 *
 * Always six weeks, always 42 cells, even when five would do. A grid that
 * changes height between months makes the whole popover jump as you page
 * through it.
 */
export function monthGrid(month: Date, weekStartsOn: number): Date[] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const lead = (first.getDay() - weekStartsOn + 7) % 7;
	const start = addDays(first, -lead);
	return Array.from({ length: 42 }, (_unused, index) => addDays(start, index));
}

/**
 * `Intl.Locale.getWeekInfo` — present at runtime in current engines, absent
 * from the TypeScript DOM lib. Declared here and reached through a guard, so
 * the call is checked rather than asserted.
 */
interface WithWeekInfo {
	getWeekInfo(): { firstDay: number };
}

function hasWeekInfo(value: object): value is WithWeekInfo {
	return "getWeekInfo" in value && typeof value.getWeekInfo === "function";
}

/** The locale's first day of the week, or Monday where it cannot be read. */
function localeWeekStart(locale: string | undefined): number {
	const resolved = new Intl.Locale(locale ?? navigator.language);
	if (!hasWeekInfo(resolved)) return 1;
	// `firstDay` is 1–7 with 7 for Sunday; the Date API uses 0–6 with 0 Sunday.
	return resolved.getWeekInfo().firstDay % 7;
}

// ─── component ───────────────────────────────────────────────────────

export const Calendar = component<CalendarProps>((props) => {
	const gridId = uid("calendar-grid");
	const labelId = uid("calendar-label");
	const locale = props.locale;
	const weekStartsOn = props.weekStartsOn ?? safeWeekStart(locale);

	const today = startOfDay(new Date());
	const initial = props.defaultValue ?? props.defaultMonth ?? today;
	const month = signal(new Date(initial.getFullYear(), initial.getMonth(), 1));
	/** The day the keyboard is on. Only this cell is tabbable. */
	const cursor = signal(startOfDay(initial));

	const selected = (): Date | undefined =>
		read(props.value) ?? props.defaultValue;

	const monthLabel = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
	});
	const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });

	function isDisabled(date: Date): boolean {
		if (props.min !== undefined && date < startOfDay(props.min)) return true;
		if (props.max !== undefined && date > startOfDay(props.max)) return true;
		return props.disabled?.(date) === true;
	}

	function choose(date: Date): void {
		if (isDisabled(date)) return;
		cursor(date);
		month(new Date(date.getFullYear(), date.getMonth(), 1));
		props.onValueChange?.(date);
	}

	function moveCursor(next: Date): void {
		cursor(next);
		// Follow the cursor across a month boundary, otherwise arrowing off the
		// end of the grid moves focus to a cell that is not on screen.
		if (
			next.getMonth() !== month().getMonth() ||
			next.getFullYear() !== month().getFullYear()
		) {
			month(new Date(next.getFullYear(), next.getMonth(), 1));
		}
		focusCursor();
	}

	function focusCursor(): void {
		// After the signal write, so the new cell exists and carries tabindex 0.
		queueMicrotask(() => {
			const grid = document.getElementById(gridId);
			grid
				?.querySelector<HTMLElement>("[data-cursor]")
				?.focus({ preventScroll: true });
		});
	}

	function onKeyDown(event: KeyboardEvent): void {
		const from = cursor();
		const moves: Record<string, () => Date> = {
			ArrowLeft: () => addDays(from, -1),
			ArrowRight: () => addDays(from, 1),
			ArrowUp: () => addDays(from, -7),
			ArrowDown: () => addDays(from, 7),
			PageUp: () => addMonths(from, -1),
			PageDown: () => addMonths(from, 1),
			Home: () => addDays(from, -((from.getDay() - weekStartsOn + 7) % 7)),
			End: () => addDays(from, 6 - ((from.getDay() - weekStartsOn + 7) % 7)),
		};

		const move = moves[event.key];
		if (move !== undefined) {
			event.preventDefault();
			moveCursor(move());
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			choose(from);
		}
	}

	const weekdayNames = Array.from({ length: 7 }, (_unused, index) =>
		weekdayLabel.format(new Date(2024, 0, 7 + ((weekStartsOn + index) % 7))),
	);

	return html`<div
		data-slot="calendar"
		class="${() => cn("bg-background w-fit rounded-md p-3", read(props.class))}"
	>
		<div class="flex items-center justify-between pb-4">
			<button
				type="button"
				aria-label="Previous month"
				class="${buttonVariants({ variant: "outline", size: "icon", class: "size-7" })}"
				@click="${() => month(addMonths(month(), -1))}"
			>${ChevronLeftIcon({ class: "size-4" })}</button>
			<div id="${labelId}" aria-live="polite" class="text-sm font-medium">
				${() => monthLabel.format(month())}
			</div>
			<button
				type="button"
				aria-label="Next month"
				class="${buttonVariants({ variant: "outline", size: "icon", class: "size-7" })}"
				@click="${() => month(addMonths(month(), 1))}"
			>${ChevronRightIcon({ class: "size-4" })}</button>
		</div>
		<div
			role="grid"
			id="${gridId}"
			aria-labelledby="${labelId}"
			class="grid grid-cols-7 gap-1"
			@keydown="${onKeyDown}"
		>
			${weekdayNames.map(
				(name) => html`<div
					role="columnheader"
					aria-label="${name}"
					class="text-muted-foreground flex size-8 items-center justify-center text-[0.8rem] font-normal"
				>${name}</div>`,
			)}
			${() => monthGrid(month(), weekStartsOn).map(renderDay)}
		</div>
	</div>`;

	function renderDay(date: Date): Child {
		const outside = date.getMonth() !== month().getMonth();
		const chosen = (): boolean => {
			const current = selected();
			return current !== undefined && isSameDay(current, date);
		};
		const onCursor = (): boolean => isSameDay(cursor(), date);
		const disabled = isDisabled(date);

		return html`<button
			type="button"
			role="gridcell"
			data-slot="calendar-day"
			data-cursor="${() => (onCursor() ? "" : undefined)}"
			data-outside="${outside ? "" : undefined}"
			data-today="${isSameDay(date, today) ? "" : undefined}"
			aria-label="${fullDate.format(date)}"
			aria-selected="${() => (chosen() ? "true" : "false")}"
			aria-current="${isSameDay(date, today) ? "date" : undefined}"
			tabindex="${() => (onCursor() ? 0 : -1)}"
			?disabled="${disabled}"
			class="${() =>
				cn(
					"flex size-8 items-center justify-center rounded-md p-0 text-sm font-normal transition-colors outline-none",
					"hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
					"aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary",
					"data-[today]:bg-accent data-[today]:aria-selected:bg-primary",
					outside ? "text-muted-foreground opacity-50" : "",
					disabled ? "pointer-events-none opacity-30" : "",
				)}"
			@click="${() => choose(date)}"
		>${date.getDate()}</button>`;
	}
});

/**
 * `Intl.Locale.getWeekInfo` is not available everywhere yet, and neither is
 * `navigator` on the server. Monday is the fallback — the ISO week start, and
 * the right answer for most of the world.
 */
function safeWeekStart(locale: string | undefined): number {
	try {
		if (typeof navigator === "undefined" && locale === undefined) return 1;
		return localeWeekStart(locale);
	} catch {
		return 1;
	}
}
