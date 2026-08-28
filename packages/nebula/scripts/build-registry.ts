/**
 * Generate `registry.json` from the source tree.
 *
 * The registry is what `nebula add` reads: for each component, which files to
 * copy and which other components come with it. Maintaining that by hand means
 * it is wrong the first time someone adds an import — so it is derived from
 * the imports themselves, which cannot drift from the code.
 *
 * The copied layout mirrors `src/` exactly: `atoms/Button.ts` lands at
 * `<components>/atoms/Button.ts`, `lib/cn.ts` at `<components>/lib/cn.ts`.
 * That is a deliberate choice and it is what removes import rewriting from the
 * CLI entirely — `../lib/cn.js` resolves in the app for the same reason it
 * resolves here. Rewriting imports on copy is where shadcn's CLI has most of
 * its edge cases, and none of them exist if the shape is preserved.
 *
 * Run with `pnpm registry`.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");

const LAYERS = ["atoms", "molecules", "organisms", "templates"] as const;
type Layer = (typeof LAYERS)[number];

interface RegistryItem {
	/** Command-line name: `nebula add button`. */
	name: string;
	/** Exported symbol, for the docs and the summary line. */
	title: string;
	layer: Layer;
	/** Every file to copy, `src`-relative, in no particular order. */
	files: string[];
	/** Other registry items this one pulls in. */
	dependencies: string[];
}

/** Every `.ts` file under `dir`, as paths relative to `src`. */
function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...walk(full));
		} else if (entry.endsWith(".ts")) {
			out.push(relative(source, full));
		}
	}
	return out;
}

/**
 * Relative imports of one file, resolved to `src`-relative paths.
 *
 * Only relative specifiers: `@c9up/aurora` is a real dependency the app
 * already has, and must survive the copy untouched.
 */
function importsOf(file: string): string[] {
	const contents = readFileSync(join(source, file), "utf8");
	const pattern = /from\s+"(\.[^"]+)"/g;
	const found: string[] = [];

	for (const match of contents.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier === undefined) continue;
		// `.js` in the source, `.ts` on disk — the NodeNext convention.
		const resolved = normalize(join(dirname(file), specifier.replace(/\.js$/, ".ts")));
		found.push(resolved);
	}
	return found;
}

const allFiles = walk(source);
const isComponent = (file: string): boolean =>
	LAYERS.some((layer) => file.startsWith(`${layer}/`)) && !file.endsWith("index.ts");

/** Map every component file to the registry name that owns it. */
const owner = new Map<string, string>();
for (const file of allFiles) {
	if (!isComponent(file)) continue;
	owner.set(file, toName(file));
}

/**
 * `atoms/Button.ts` → `button`, `organisms/DropdownMenu.ts` → `dropdown-menu`.
 *
 * Kebab-case because that is what the shadcn CLI uses, so `nebula add
 * dropdown-menu` is the command someone already knows.
 */
function toName(file: string): string {
	const base = file.split("/").pop()?.replace(/\.ts$/, "") ?? file;
	return base
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

function layerOf(file: string): Layer {
	const prefix = file.split("/")[0];
	const layer = LAYERS.find((candidate) => candidate === prefix);
	if (layer === undefined) {
		throw new Error(`${file} is not under a known atomic layer`);
	}
	return layer;
}

/**
 * Everything one component needs, following imports until nothing new appears.
 *
 * Shared files (`lib/`, `primitives/`) are collected into the item's own file
 * list; another component is recorded as a dependency instead, so the CLI
 * installs it as a registry item and the user can see what came with what.
 */
function collect(entry: string): { files: string[]; dependencies: string[] } {
	const files = new Set<string>([entry]);
	const dependencies = new Set<string>();
	const queue = [entry];

	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined) continue;

		for (const imported of importsOf(current)) {
			const ownedBy = owner.get(imported);
			if (ownedBy !== undefined && imported !== entry) {
				dependencies.add(ownedBy);
				continue;
			}
			if (files.has(imported)) continue;
			files.add(imported);
			queue.push(imported);
		}
	}

	return { files: [...files].sort(), dependencies: [...dependencies].sort() };
}

const items: RegistryItem[] = [];
for (const file of allFiles) {
	if (!isComponent(file)) continue;
	const { files, dependencies } = collect(file);
	items.push({
		name: toName(file),
		title: file.split("/").pop()?.replace(/\.ts$/, "") ?? file,
		layer: layerOf(file),
		files,
		dependencies,
	});
}

items.sort((left, right) => left.name.localeCompare(right.name));

const registry = {
	$schema: "https://nebula.c9up.dev/registry.schema.json",
	name: "@c9up/nebula",
	homepage: "https://github.com/C9up/nebula",
	/**
	 * Copies mirror `src/`, so the CLI never rewrites an import. Recorded in the
	 * file so a third-party consumer of this registry knows the same.
	 */
	layout: "mirror",
	items,
};

writeFileSync(join(root, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`registry.json — ${items.length} items`);
