/**
 * Toaster — transient notifications.
 *
 * shadcn delegates this to `sonner`. nebula keeps it in-house, and the shape
 * is the same: one region mounted once near the app root, and a `toast()`
 * function callable from anywhere with no reference to it.
 *
 * That decoupling is the whole design. A queue in module state, a signal the
 * region subscribes to, and `toast.error(…)` works from a route handler's
 * error branch without threading a handle down to it.
 *
 * The accessibility rules are stricter than they look, and the region is
 * static so they can be satisfied:
 *
 * - The live region must exist **before** the toast does. A live region
 *   inserted with content already in it is not announced by most screen
 *   readers, which is why the region mounts empty and stays.
 * - `polite` for ordinary toasts, `assertive` for errors. Everything
 *   interrupting the user is the fastest way to make a screen reader
 *   unusable — so there are two regions, and each toast picks one.
 * - Hovering pauses the timers. A toast that vanishes while being read is the
 *   single most common complaint about the pattern.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { XIcon } from "../lib/icons.js";
import { fadeInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";

export type ToastVariant = "default" | "success" | "error" | "warning";

export interface ToastOptions {
	title: Child;
	description?: Child;
	variant?: ToastVariant;
	/** Milliseconds on screen. `0` keeps it until dismissed. */
	duration?: number;
	action?: { label: string; onClick: () => void };
}

interface ActiveToast extends ToastOptions {
	readonly id: number;
	readonly variant: ToastVariant;
}

const DEFAULT_DURATION_MS = 5000;

const queue = signal<readonly ActiveToast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
/** When each toast is due to disappear, as an epoch timestamp. */
const deadlines = new Map<number, number>();
/** Time each toast had left when the pointer entered the region. */
const remainders = new Map<number, number>();
let nextId = 0;

function dismiss(id: number): void {
	clearTimer(id);
	deadlines.delete(id);
	remainders.delete(id);
	queue(queue().filter((entry) => entry.id !== id));
}

function clearTimer(id: number): void {
	const timer = timers.get(id);
	if (timer !== undefined) clearTimeout(timer);
	timers.delete(id);
}

function schedule(id: number, duration: number): void {
	// A duration of zero means "stays until dismissed", so no timer and no
	// deadline — which is also what keeps pause/resume from resurrecting one.
	if (duration <= 0) return;
	clearTimer(id);
	timers.set(
		id,
		setTimeout(() => dismiss(id), duration),
	);
	deadlines.set(id, Date.now() + duration);
}

/** Hold every countdown while the pointer is over the region. */
function pauseAll(): void {
	const now = Date.now();
	for (const [id, deadline] of deadlines) {
		clearTimer(id);
		remainders.set(id, Math.max(deadline - now, 0));
	}
}

/**
 * Resume every held countdown.
 *
 * A minimum is applied: a toast the pointer rested on until its time ran out
 * would otherwise vanish the instant the pointer left, which reads as the
 * hover having dismissed it.
 */
function resumeAll(minimumMs: number): void {
	for (const [id, remaining] of remainders) {
		schedule(id, Math.max(remaining, minimumMs));
	}
	remainders.clear();
}

function show(options: ToastOptions): number {
	nextId += 1;
	const id = nextId;
	const entry: ActiveToast = {
		...options,
		id,
		variant: options.variant ?? "default",
	};
	queue([...queue(), entry]);
	schedule(id, options.duration ?? DEFAULT_DURATION_MS);
	return id;
}

/**
 * Raise a toast. Returns its id, which `dismiss` accepts.
 *
 * Callable from anywhere — no component, no context, no handle.
 */
export const toast = {
	show,
	dismiss,
	success: (title: Child, description?: Child): number =>
		show({ title, description, variant: "success" }),
	error: (title: Child, description?: Child): number =>
		// Errors stay twice as long: the user has to read them, and often act.
		show({
			title,
			description,
			variant: "error",
			duration: DEFAULT_DURATION_MS * 2,
		}),
	warning: (title: Child, description?: Child): number =>
		show({ title, description, variant: "warning" }),
	/** Clear everything — on navigation, say. */
	clear(): void {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		deadlines.clear();
		remainders.clear();
		queue([]);
	},
};

const variantClasses: Record<ToastVariant, string> = {
	default: "bg-popover text-popover-foreground border",
	success:
		"bg-popover text-popover-foreground border-l-4 border-l-primary border",
	error: "bg-popover text-destructive border-l-4 border-l-destructive border",
	warning:
		"bg-popover text-popover-foreground border-l-4 border-l-chart-4 border",
};

export interface ToasterProps {
	/** Which corner. Default `"bottom-right"`. */
	position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
	class?: Reactive<string>;
}

const positionClasses: Record<NonNullable<ToasterProps["position"]>, string> = {
	"top-right": "top-0 right-0 flex-col",
	"top-left": "top-0 left-0 flex-col",
	"bottom-right": "bottom-0 right-0 flex-col-reverse",
	"bottom-left": "bottom-0 left-0 flex-col-reverse",
};

/**
 * Mount once, near the root of the app.
 *
 * `data-nebula-live` marks it as exempt from the `aria-hidden` sweep a modal
 * performs over its siblings — a toast raised while a dialog is open still has
 * to be announced.
 */
export const Toaster = component<ToasterProps>((props) => {
	const position = props.position ?? "bottom-right";

	return html`<div
		data-slot="toaster"
		data-nebula-live
		class="${() =>
			cn(
				"pointer-events-none fixed z-100 flex max-h-screen w-full p-4 sm:max-w-sm",
				positionClasses[position],
				read(props.class),
			)}"
		@pointerenter="${pauseAll}"
		@pointerleave="${() => resumeAll(1000)}"
	>
		<div role="status" aria-live="polite" aria-atomic="false" class="contents">
			${() =>
				queue()
					.filter((entry) => entry.variant !== "error")
					.map(renderToast)}
		</div>
		<div role="alert" aria-live="assertive" aria-atomic="false" class="contents">
			${() =>
				queue()
					.filter((entry) => entry.variant === "error")
					.map(renderToast)}
		</div>
	</div>`;
});

function renderToast(entry: ActiveToast): Child {
	return html`<div
		data-slot="toast"
		data-variant="${entry.variant}"
		data-state="open"
		class="${cn(
			"pointer-events-auto mt-2 flex w-full items-start gap-3 rounded-md p-4 shadow-lg",
			variantClasses[entry.variant],
			fadeInOut,
		)}"
	>
		<div class="flex-1 text-sm">
			<div class="font-medium">${entry.title}</div>
			${
				entry.description === undefined
					? null
					: html`<div class="text-muted-foreground mt-1">${entry.description}</div>`
			}
		</div>
		${
			entry.action === undefined
				? null
				: html`<button
					type="button"
					class="text-sm font-medium underline-offset-4 hover:underline"
					@click="${() => {
						entry.action?.onClick();
						dismiss(entry.id);
					}}"
				>${entry.action.label}</button>`
		}
		<button
			type="button"
			aria-label="Dismiss notification"
			class="opacity-60 transition-opacity hover:opacity-100"
			@click="${() => dismiss(entry.id)}"
		>${XIcon({ class: "size-4" })}</button>
	</div>`;
}
