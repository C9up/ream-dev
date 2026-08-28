/**
 * Avatar — a user's picture, with a fallback when there is none.
 *
 * shadcn splits this into `Avatar` / `AvatarImage` / `AvatarFallback` because
 * Radix needs three components to track the image's load state across them.
 * nebula tracks it in one signal inside one component, so the API is a `src`
 * and a `fallback`.
 *
 * Three states, not two. An image that has not loaded *yet* must not show the
 * fallback — swapping initials in and a photo over them a moment later is the
 * flicker this component exists to avoid. So the fallback appears only once
 * the image has actually failed, or when there was no `src` to begin with.
 */

import { component, html, signal } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

type LoadState = "pending" | "loaded" | "failed";

export interface AvatarProps {
	src?: Reactive<string | undefined>;
	alt?: Reactive<string>;
	/** Shown when there is no image, or it failed. Usually initials. */
	fallback?: Slot;
	class?: Reactive<string>;
}

export const Avatar = component<AvatarProps>((props) => {
	const state = signal<LoadState>("pending");

	const hasSrc = (): boolean => {
		const src = read(props.src);
		return src !== undefined && src !== "";
	};

	const showFallback = (): boolean => !hasSrc() || state() === "failed";

	return html`<span
		data-slot="avatar"
		class="${() =>
			cn(
				"relative flex size-8 shrink-0 overflow-hidden rounded-full",
				read(props.class),
			)}"
	>
		${() =>
			hasSrc() && state() !== "failed"
				? html`<img
						data-slot="avatar-image"
						src="${() => read(props.src)}"
						alt="${() => readOr(props.alt, "")}"
						class="aspect-square size-full object-cover"
						@load="${() => state("loaded")}"
						@error="${() => state("failed")}"
					/>`
				: null}
		${() =>
			showFallback()
				? html`<span
						data-slot="avatar-fallback"
						class="bg-muted flex size-full items-center justify-center rounded-full text-xs font-medium"
					>${slot(props.fallback)}</span>`
				: null}
	</span>`;
});
