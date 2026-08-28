#!/usr/bin/env node
/**
 * Launcher for the `nebula` command.
 *
 * Prefers the built CLI and falls back to the TypeScript source, so the
 * command works inside this workspace before anything is compiled. Node strips
 * the types itself from 22.18 on; on an older runtime the fallback fails with
 * a clear message rather than a syntax error deep in an import.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const here = dirname(new URL(import.meta.url).pathname);
const built = join(here, "..", "dist", "cli", "main.js");
const source = join(here, "..", "src", "cli", "main.ts");
const entry = existsSync(built) ? built : source;

try {
	const { main } = await import(pathToFileURL(entry).href);
	process.exitCode = main(process.argv.slice(2));
} catch (error) {
	if (entry === source) {
		process.stderr.write(
			"nebula: could not run the TypeScript source. Build the package " +
				"(`pnpm build`) or use Node 22.18 or newer.\n",
		);
	}
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
}
