/**
 * What a component accepts as content.
 *
 * Aurora's renderer already handles the whole union in a text slot: nested
 * templates, raw nodes, primitives, and arrays of any of those, with `null`,
 * `undefined` and `false` rendering nothing. `Child` names that union so a
 * component's props say what they mean instead of falling back to `unknown`,
 * and so passing a value the renderer would silently drop is a type error at
 * the call site rather than a blank space on the page.
 *
 * `Slot` is the reactive form. Content that changes must arrive as an accessor
 * — Aurora never re-renders a component, so a plain value read at setup is
 * frozen for the lifetime of the node.
 */

import type { TemplateResult } from "@c9up/aurora";
import type { Reactive } from "./props.js";

export type Child =
	| TemplateResult
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly Child[];

/** Content that may be constant or recomputed. */
export type Slot = Reactive<Child>;

/**
 * Bind content into a template so it stays live.
 *
 * Returns the accessor form unchanged and wraps a constant in one. Templates
 * should always interpolate `${slot(props.children)}`: handing the renderer a
 * bare value works until a sibling prop makes the content dynamic, at which
 * point the binding quietly stops updating and nothing points at why.
 */
export function slot(content: Slot | undefined): () => Child {
	if (content === undefined) return () => null;
	return typeof content === "function" ? content : () => content;
}
