/**
 * `cva` — class-variance-authority, reimplemented from scratch with ZERO
 * dependencies.
 *
 * shadcn/ui is built on two class helpers: `cn` (clsx + tailwind-merge) and
 * `cva` (variant → class-list resolution). Aurora already ships `cn` written
 * from scratch in `@c9up/aurora` (src/cn.ts), so this file is the other half.
 * Between them, nebula pulls in no runtime dependency at all.
 *
 *   const button = cva(
 *     "inline-flex items-center rounded-md text-sm font-medium",
 *     {
 *       variants: {
 *         variant: { default: "bg-primary text-primary-foreground",
 *                    ghost:   "hover:bg-accent" },
 *         size:    { sm: "h-8 px-3", lg: "h-10 px-8" },
 *       },
 *       compoundVariants: [
 *         { variant: "ghost", size: "sm", class: "px-2" },
 *       ],
 *       defaultVariants: { variant: "default", size: "sm" },
 *     },
 *   )
 *
 *   button()                                  // base + default variants
 *   button({ variant: "ghost" })              // ghost, still size sm
 *   button({ size: "lg", class: "w-full" })   // caller classes win
 *
 * Differences from the upstream package, both deliberate:
 *
 * 1. The result runs through Aurora's `cn`, so a variant that sets `px-2`
 *    genuinely overrides a base `px-3` instead of emitting both and leaving
 *    the winner to CSS source order. Upstream cva only concatenates; every
 *    real shadcn component then wraps the call in `cn(...)` to get here
 *    anyway. Doing it inside removes that ceremony from ~50 components.
 * 2. `class` and `className` are both accepted. Aurora templates use `class`;
 *    `className` exists only so code pasted over from a React codebase keeps
 *    working.
 */

import { type ClassValue, cn } from "./cn.js";

/**
 * One variant axis: a variant name mapped to the classes each of its values
 * contributes. `{ size: { sm: "h-8", lg: "h-10" } }` is one axis with two
 * values.
 */
export type VariantShape = Record<string, Record<string, ClassValue>>;

/**
 * The value accepted for one axis.
 *
 * An axis keyed by `"true"` / `"false"` is a boolean axis — the caller passes
 * a real `boolean`, not the string. That mapping is what lets
 * `{ disabled: { true: "opacity-50" } }` be driven by `disabled: true`.
 */
type VariantValue<T> =
	Extract<keyof T, string> extends "true" | "false"
		? boolean
		: Extract<keyof T, string>;

/** Props selecting one value per axis. Every axis is optional. */
export type VariantSelection<V extends VariantShape> = {
	[K in keyof V]?: VariantValue<V[K]> | null | undefined;
};

/**
 * A compound rule matches when EVERY axis it names matches. An axis may list
 * several accepted values, in which case any of them matches.
 */
export type CompoundVariant<V extends VariantShape> = {
	[K in keyof V]?: VariantValue<V[K]> | ReadonlyArray<VariantValue<V[K]>>;
} & ClassOverrides;

/** Extra keys every generated function accepts on top of its own axes. */
export interface ClassOverrides {
	class?: ClassValue;
	className?: ClassValue;
}

export interface VariantConfig<V extends VariantShape> {
	variants?: V;
	compoundVariants?: ReadonlyArray<CompoundVariant<V>>;
	defaultVariants?: VariantSelection<V>;
}

/** The props a `cva()` result accepts, minus the two class escape hatches. */
export type VariantProps<F> = F extends (props?: infer P) => string
	? Omit<NonNullable<P>, "class" | "className">
	: never;

/** A compound rule flattened into "conditions + classes it contributes". */
interface CompoundRule {
	/** Each entry is one axis and the set of values that satisfy it. */
	readonly conditions: ReadonlyArray<readonly [string, readonly string[]]>;
	readonly classes: readonly ClassValue[];
}

/**
 * Build a variant resolver. Returns a function from a variant selection to a
 * single, conflict-resolved class string.
 */
export function cva<V extends VariantShape>(
	base?: ClassValue,
	config?: VariantConfig<V>,
): (props?: VariantSelection<V> & ClassOverrides) => string {
	// Widening to the non-generic shapes up front is what keeps the body free
	// of casts: `V` cannot be indexed by a plain `string`, `VariantShape` can.
	const variants: VariantShape = config?.variants ?? {};
	const axes = Object.keys(variants);
	const defaults = toValueMap(config?.defaultVariants);
	const compounds = normaliseCompounds(config?.compoundVariants);

	return (props?: VariantSelection<V> & ClassOverrides): string => {
		const selection = selectionFor(defaults, props);
		const parts: ClassValue[] = [base];

		for (const axis of axes) {
			const chosen = selection[axis];
			if (chosen === undefined) continue;
			// Indexed by the *string form* of the value, so a boolean axis reaches
			// its `"true"` / `"false"` entry here.
			const classesForValue = variants[axis]?.[chosen];
			if (classesForValue !== undefined) parts.push(classesForValue);
		}

		for (const rule of compounds) {
			if (satisfies(rule, selection)) parts.push(...rule.classes);
		}

		// Caller overrides come last so they win the tailwind-merge pass.
		parts.push(props?.class, props?.className);
		return cn(parts);
	};
}

/**
 * Read an object's own enumerable entries with honest `unknown` values.
 *
 * Variant selections are generic mapped types, which TypeScript will not let
 * you index with a plain `string`. Funnelling every read through one helper
 * typed `object → [string, unknown][]` gets the values out without a cast at
 * any call site, and forces each one to narrow before use.
 */
function entriesOf(source: object): ReadonlyArray<readonly [string, unknown]> {
	return Object.entries(source);
}

/**
 * Collapse a selection object down to `axis → string value`.
 *
 * Normalising to strings here is what keeps boolean-axis handling in a single
 * place: `true` becomes `"true"`, and every lookup downstream — variant
 * classes and compound matching alike — is a plain string compare.
 */
function toValueMap(source: object | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!source) return out;
	for (const [key, value] of entriesOf(source)) {
		if (isClassKey(key)) continue;
		if (value === undefined || value === null) continue;
		out[key] = String(value);
	}
	return out;
}

/**
 * Merge caller props over the defaults.
 *
 * An omitted axis (or an explicit `undefined`) keeps its default; an explicit
 * `null` clears it, which is how upstream cva lets a caller opt out of a
 * default variant entirely.
 */
function selectionFor(
	defaults: Record<string, string>,
	props: object | undefined,
): Record<string, string | undefined> {
	const selection: Record<string, string | undefined> = { ...defaults };
	if (!props) return selection;

	for (const [key, value] of entriesOf(props)) {
		if (isClassKey(key)) continue;
		if (value === undefined) continue;
		selection[key] = value === null ? undefined : String(value);
	}
	return selection;
}

/** Flatten compound rules once, at construction, rather than on every call. */
function normaliseCompounds<V extends VariantShape>(
	compounds: ReadonlyArray<CompoundVariant<V>> | undefined,
): readonly CompoundRule[] {
	if (!compounds) return [];

	const out: CompoundRule[] = [];
	for (const rule of compounds) {
		const conditions: Array<readonly [string, readonly string[]]> = [];
		const classes: ClassValue[] = [];

		for (const [key, value] of entriesOf(rule)) {
			if (isClassKey(key)) {
				if (isClassValue(value)) classes.push(value);
				continue;
			}
			if (value === undefined || value === null) continue;
			const accepted = Array.isArray(value)
				? value.map((one) => String(one))
				: [String(value)];
			conditions.push([key, accepted]);
		}
		out.push({ conditions, classes });
	}
	return out;
}

/** Does every condition of a compound rule hold for this selection? */
function satisfies(
	rule: CompoundRule,
	selection: Record<string, string | undefined>,
): boolean {
	for (const [axis, accepted] of rule.conditions) {
		const actual = selection[axis];
		if (actual === undefined) return false;
		if (!accepted.includes(actual)) return false;
	}
	return true;
}

function isClassKey(key: string): boolean {
	return key === "class" || key === "className";
}

/**
 * Narrow a compound rule's `class` / `className` back to `ClassValue`.
 *
 * The value arrives as `unknown` from `entriesOf`; `ClassValue` covers every
 * shape `cn` accepts, so anything that is not a rejected primitive passes
 * through untouched and `cn` does the rest of the work.
 */
function isClassValue(value: unknown): value is ClassValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null ||
		value === undefined ||
		typeof value === "object"
	);
}
