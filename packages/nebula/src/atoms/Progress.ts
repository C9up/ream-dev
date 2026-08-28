/**
 * Progress — a determinate progress bar.
 *
 * The fill is a full-width child translated left by the remaining percentage,
 * rather than a width animation. Transforms are composited off the main
 * thread; animating `width` relayouts the bar on every frame, which is visible
 * on a long upload.
 *
 * A `value` of `null` means indeterminate, and drops `aria-valuenow` — the
 * ARIA spec is explicit that an absent value is how "unknown progress" is
 * expressed, and reporting `0` instead tells the user it has not started.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface ProgressProps {
	/** `0`–`max`, or `null` for indeterminate. */
	value?: Reactive<number | null>;
	max?: Reactive<number>;
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
}

export const Progress = component<ProgressProps>((props) => {
	const max = (): number => {
		const given = readOr(props.max, 100);
		// A zero or negative maximum would make the percentage infinite or
		// negative and push the fill off the track in one direction or the other.
		return given > 0 ? given : 100;
	};

	const value = (): number | null => {
		const given = readOr(props.value, 0);
		if (given === null) return null;
		return Math.min(Math.max(given, 0), max());
	};

	const percent = (): number => {
		const current = value();
		return current === null ? 0 : (current / max()) * 100;
	};

	return html`<div
		data-slot="progress"
		role="progressbar"
		aria-valuemin="0"
		aria-valuemax="${max}"
		aria-valuenow="${() => value() ?? undefined}"
		aria-label="${() => read(props.label)}"
		class="${() =>
			cn(
				"bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
				read(props.class),
			)}"
	>
		<div
			data-slot="progress-indicator"
			class="bg-primary h-full w-full flex-1 transition-transform"
			style="${() => `transform: translateX(-${100 - percent()}%)`}"
		></div>
	</div>`;
});
