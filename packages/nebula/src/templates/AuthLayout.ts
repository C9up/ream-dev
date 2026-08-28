/**
 * AuthLayout — a centred card for sign-in, sign-up and password reset.
 *
 * `min-h-svh` with the card centred by flex, rather than absolute positioning
 * and a translate. Centring by transform breaks as soon as the card grows
 * taller than the viewport — a sign-up form with four fields and a validation
 * error on each — because the top half goes above the fold with nothing to
 * scroll to.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface AuthLayoutProps {
	/** Product name or logo, above the card. */
	brand?: Slot;
	title: Child;
	description?: Child;
	children?: Slot;
	/** Under the card — "Already have an account?" and the like. */
	footer?: Slot;
	class?: Reactive<string>;
}

export const AuthLayout = component<AuthLayoutProps>((props) => {
	return html`<div
		data-slot="auth-layout"
		class="${() =>
			cn(
				"bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10",
				read(props.class),
			)}"
	>
		<div class="flex w-full max-w-sm flex-col gap-6">
			${
				props.brand === undefined
					? null
					: html`<div class="flex justify-center">${slot(props.brand)}</div>`
			}
			<div
				data-slot="auth-card"
				class="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border p-6 shadow-sm"
			>
				<div class="flex flex-col gap-1.5 text-center">
					<h1 class="text-xl leading-none font-semibold">${props.title}</h1>
					${
						props.description === undefined
							? null
							: html`<p class="text-muted-foreground text-sm">${props.description}</p>`
					}
				</div>
				${slot(props.children)}
			</div>
			${
				props.footer === undefined
					? null
					: html`<div class="text-muted-foreground text-center text-sm">
						${slot(props.footer)}
					</div>`
			}
		</div>
	</div>`;
});
