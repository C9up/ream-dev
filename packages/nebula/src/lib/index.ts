/**
 * The two class helpers shadcn is built on, plus the prop plumbing Aurora
 * needs in their place.
 *
 * `cn` comes from aurora (clsx + tailwind-merge, already written from scratch
 * there); `cva` is reimplemented here. Between them nebula adds no runtime
 * dependency at all — the same call the workspace made for `cn` itself.
 */

export { type ClassValue, clsx, cn, twMerge } from "./cn.js";
export {
	type ClassOverrides,
	type CompoundVariant,
	cva,
	type VariantConfig,
	type VariantProps,
	type VariantSelection,
	type VariantShape,
} from "./cva.js";
export { byId, resetIds, uid } from "./id.js";
export { accessor, callHandler, type Reactive, read, readOr } from "./props.js";
