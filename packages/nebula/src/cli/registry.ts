/**
 * Reading `registry.json`.
 *
 * The file is generated (`pnpm registry`) and shipped with the package, so it
 * is data arriving from disk — parsed, then checked before use. A malformed
 * registry should fail with a sentence saying so, not with an undefined
 * property three functions later.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export type Layer = "atoms" | "molecules" | "organisms" | "templates";

export interface RegistryItem {
	name: string;
	title: string;
	layer: Layer;
	files: readonly string[];
	dependencies: readonly string[];
}

export interface Registry {
	name: string;
	items: readonly RegistryItem[];
}

function isLayer(value: unknown): value is Layer {
	return (
		value === "atoms" ||
		value === "molecules" ||
		value === "organisms" ||
		value === "templates"
	);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((entry) => typeof entry === "string")
	);
}

function isItem(value: unknown): value is RegistryItem {
	if (typeof value !== "object" || value === null) return false;
	const name = Reflect.get(value, "name");
	const title = Reflect.get(value, "title");
	const layer = Reflect.get(value, "layer");
	const files = Reflect.get(value, "files");
	const dependencies = Reflect.get(value, "dependencies");
	return (
		typeof name === "string" &&
		typeof title === "string" &&
		isLayer(layer) &&
		isStringArray(files) &&
		isStringArray(dependencies)
	);
}

function isRegistry(value: unknown): value is Registry {
	if (typeof value !== "object" || value === null) return false;
	const items = Reflect.get(value, "items");
	return Array.isArray(items) && items.every(isItem);
}

/** Load the registry shipped alongside this package. */
export function loadRegistry(path: string): Registry {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!isRegistry(parsed)) {
		throw new Error(
			`${path} is not a valid nebula registry — regenerate it with \`pnpm registry\`.`,
		);
	}
	return parsed;
}

/** Where this package is installed, so its sources and registry can be read. */
export function packageRoot(from: string): string {
	const require = createRequire(from);
	// Resolve through the manifest rather than the entry point: the entry is
	// `src/index.ts` in this workspace and `dist/index.js` once published, and
	// only `package.json` is at a fixed place in both.
	return require
		.resolve("@c9up/nebula/package.json")
		.replace(/package\.json$/, "");
}

/**
 * An item plus everything it needs, in install order.
 *
 * Depth-first with a seen set: Combobox pulls Command, Command pulls nothing
 * further, and a diamond (two organisms sharing a molecule) copies it once.
 */
export function resolveItems(
	registry: Registry,
	names: readonly string[],
): RegistryItem[] {
	const byName = new Map(registry.items.map((item) => [item.name, item]));
	const seen = new Set<string>();
	const ordered: RegistryItem[] = [];

	function visit(name: string): void {
		if (seen.has(name)) return;
		seen.add(name);
		const item = byName.get(name);
		if (item === undefined) {
			throw new Error(
				`unknown component "${name}" — run \`nebula list\` to see what exists.`,
			);
		}
		for (const dependency of item.dependencies) visit(dependency);
		ordered.push(item);
	}

	for (const name of names) visit(name);
	return ordered;
}
