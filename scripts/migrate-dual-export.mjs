#!/usr/bin/env node
/**
 * Dual-export migration v2 — `publishConfig` strategy.
 *
 * v1 set the TOP-LEVEL exports to `dist/*.js` with a `development`
 * condition falling back to `src/*.ts`. That broke the dev loop:
 * Node (and `tsx`) don't enable the `development` condition by
 * default, so apps resolved the COMPILED `dist/` output and edits to
 * `src/` were invisible until a rebuild.
 *
 * v2 keeps the package SOURCE-FIRST in the working tree (top-level
 * `main`/`types`/`exports` point at `src/*.ts`, so the workspace dev
 * loop + @swc-node/register Just Work with zero conditions) and moves
 * the compiled paths into `publishConfig`. pnpm substitutes
 * `publishConfig.{main,types,exports}` into the tarball at
 * `pnpm publish` time, so npm consumers get `dist/*.js` while the
 * checked-in package.json never points at build output.
 *
 * For each package with a `src/` directory:
 *   1. Normalise every `exports` entry back to the source path
 *      (`./src/<x>.ts`) — collapse any v1 `{ types, development,
 *      import }` shape down to `{ import: src, types: src }` plus any
 *      non-dist conditions (e.g. `browser`) preserved.
 *   2. Set top-level `main`/`types` → `./src/index.ts`.
 *   3. Build `publishConfig` with the dist mirror: `main`/`types` →
 *      `./dist/...`, and `exports` where each entry is
 *      `{ types: dist/*.d.ts, import: dist/*.js }` (+ preserved
 *      non-dist conditions).
 *   4. Keep `tsconfig.build.json`, the `build`/`typecheck` scripts,
 *      the `files: [src, dist, ...]` array, and the typescript devDep
 *      (all already in place from v1).
 *
 * Usage: node scripts/migrate-dual-export.mjs [--dry] [<pkg>...]
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, "../..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const targets = args.filter((a) => !a.startsWith("--"));

function packagePaths() {
	const out = [];
	const pkgsRoot = join(REPO_ROOT, "packages");
	for (const name of readdirSync(pkgsRoot)) {
		const dir = join(pkgsRoot, name);
		if (!statSync(dir).isDirectory()) continue;
		if (!existsSync(join(dir, "package.json"))) continue;
		if (!existsSync(join(dir, "src"))) continue;
		out.push(dir);
	}
	return out;
}

const SRC_TS = /^\.\/src\/.+\.ts$/;
const DIST_JS = /^\.\/dist\/.+\.js$/;
const DIST_DTS = /^\.\/dist\/.+\.d\.ts$/;

/** Extract the canonical `./src/<x>.ts` path from any export entry value. */
function srcPathOf(value) {
	if (typeof value === "string") {
		if (SRC_TS.test(value)) return value;
		if (DIST_JS.test(value)) return value.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts");
		return null;
	}
	if (value && typeof value === "object") {
		for (const v of Object.values(value)) {
			if (typeof v === "string" && SRC_TS.test(v)) return v;
		}
		// No src leaf — derive from a dist leaf.
		for (const v of Object.values(value)) {
			if (typeof v === "string" && DIST_JS.test(v)) {
				return v.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts");
			}
		}
	}
	return null;
}

/** Non-dist, non-src conditions worth preserving on the source entry (e.g. browser pointing elsewhere). */
function preservedConditions(value) {
	const out = {};
	if (value && typeof value === "object") {
		for (const [cond, leaf] of Object.entries(value)) {
			if (typeof leaf !== "string") continue;
			if (SRC_TS.test(leaf) || DIST_JS.test(leaf) || DIST_DTS.test(leaf)) continue;
			out[cond] = leaf;
		}
	}
	return out;
}

function toDist(srcPath, ext) {
	return srcPath.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ext);
}

function migratePackage(dir) {
	const pkgPath = join(dir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	const before = JSON.stringify(pkg);

	const hasRootEntry = pkg.exports && typeof pkg.exports === "object" && "." in pkg.exports;

	// 1 + 2. Source-first top-level.
	if (hasRootEntry) {
		pkg.main = "./src/index.ts";
		pkg.types = "./src/index.ts";
	}

	// A package with no `exports` map but a `src/index.ts` main still
	// needs a `.` entry — otherwise we'd write `exports: {}` which Node
	// treats as "nothing is exported" (ERR_PACKAGE_PATH_NOT_EXPORTED).
	if (
		(!pkg.exports || Object.keys(pkg.exports).length === 0) &&
		existsSync(join(dir, "src", "index.ts"))
	) {
		pkg.exports = { ".": "./src/index.ts" };
	}

	const srcExports = {};
	const distExports = {};
	if (pkg.exports && typeof pkg.exports === "object") {
		for (const [key, value] of Object.entries(pkg.exports)) {
			const srcPath = srcPathOf(value);
			if (srcPath === null) {
				srcExports[key] = value;
				distExports[key] = value;
				continue;
			}
			const extras = preservedConditions(value);
			srcExports[key] = { types: srcPath, ...extras, import: srcPath };
			distExports[key] = {
				types: toDist(srcPath, ".d.ts"),
				...extras,
				import: toDist(srcPath, ".js"),
			};
		}
	}
	pkg.exports = srcExports;

	// 3. publishConfig dist mirror.
	pkg.publishConfig = {
		...(pkg.publishConfig ?? {}),
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		exports: distExports,
	};

	const after = JSON.stringify(pkg);
	if (after === before) return { changed: false };
	if (!DRY) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	return { changed: true };
}

function main() {
	let pkgs = packagePaths();
	if (targets.length > 0) {
		pkgs = pkgs.filter((p) => targets.some((t) => p.endsWith(`/${t}`)));
	}
	console.log(`Migrating ${pkgs.length} packages to publishConfig strategy${DRY ? " (dry-run)" : ""}…`);
	let touched = 0;
	for (const dir of pkgs) {
		const name = dir.split("/").pop();
		const r = migratePackage(dir);
		if (r.changed) {
			touched += 1;
			console.log(`  ✓ ${name}`);
		} else {
			console.log(`  — ${name} (no change)`);
		}
	}
	console.log(`Done. ${touched}/${pkgs.length} migrated.`);
}

main();
