/**
 * `nebula add <component…>` — copy component sources into the project.
 *
 * The point of the registry model: what lands in the project is the source,
 * and from then on it is the user's. No version, no upgrade path, no wrapper
 * to fight when a design needs one class changed.
 *
 * Copies mirror the package's own layout, so `../lib/cn.js` resolves in the
 * project exactly as it does here and no import is ever rewritten. Rewriting
 * is where a copy-the-source CLI accumulates its edge cases; preserving the
 * shape means there are none.
 *
 * Existing files are never overwritten without `--force`. The whole premise is
 * that the user edits these, and a second `nebula add button` after a week of
 * changes must not silently discard them.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultPaths, type NebulaPaths } from "../config.js";
import { loadRegistry, packageRoot, resolveItems } from "./registry.js";

export interface AddOptions {
	cwd: string;
	names: readonly string[];
	paths?: Partial<NebulaPaths>;
	force?: boolean;
	/** Print what would happen and write nothing. */
	dryRun?: boolean;
}

export interface AddResult {
	written: string[];
	skipped: string[];
}

export function add(options: AddOptions): AddResult {
	const root = packageRoot(join(options.cwd, "package.json"));
	const registry = loadRegistry(join(root, "registry.json"));
	const items = resolveItems(registry, options.names);

	const target = join(
		options.cwd,
		options.paths?.components ?? defaultPaths.components,
	);
	const written: string[] = [];
	const skipped: string[] = [];
	// Shared files — `lib/cn.ts`, the primitives — belong to several items, so
	// one run reaches the same path repeatedly. Without this, the second visit
	// finds the file the first visit just wrote and reports it as pre-existing,
	// which reads as a warning about the user's own work.
	const handled = new Set<string>();

	for (const item of items) {
		for (const file of item.files) {
			if (handled.has(file)) continue;
			handled.add(file);

			const from = join(root, "src", file);
			const to = join(target, file);

			if (existsSync(to) && options.force !== true) {
				skipped.push(file);
				continue;
			}
			written.push(file);
			if (options.dryRun === true) continue;

			mkdirSync(dirname(to), { recursive: true });
			copyFileSync(from, to);
		}
	}

	return { written, skipped };
}
