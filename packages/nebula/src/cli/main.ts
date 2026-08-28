/**
 * The `nebula` command.
 *
 * Argument parsing by hand, with no dependency — the surface is three verbs
 * and four flags, and a parser library would be the only runtime dependency in
 * a package whose stated position is that it has none.
 *
 * Kept separate from the `bin/` launcher so it can be called directly from a
 * test, and so the day this moves into `ream-cli` alongside `ream add`, the
 * behaviour to port is one file.
 */

import { join } from "node:path";
import { adapterNames, isAdapterName } from "../adapters/index.js";
import { add } from "./add.js";
import { init } from "./init.js";
import { loadRegistry, packageRoot } from "./registry.js";

const USAGE = `nebula — shadcn/ui for Aurora, organised as atomic design

  nebula init [--adapter tailwind|unocss|css]   write config + style stubs
  nebula add <component…> [--force]             copy components into the project
  nebula list [--layer atoms|molecules|…]       show what the registry holds

Flags
  --adapter <name>   CSS engine to configure (default: tailwind)
  --layer <name>     restrict \`list\` to one atomic layer
  --force            overwrite files that already exist
  --dry-run          print what would happen, write nothing
`;

interface Parsed {
	command: string;
	positional: string[];
	flags: Map<string, string | true>;
}

function parse(argv: readonly string[]): Parsed {
	const positional: string[] = [];
	const flags = new Map<string, string | true>();

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === undefined) continue;

		if (!token.startsWith("--")) {
			positional.push(token);
			continue;
		}

		const name = token.slice(2);
		const next = argv[index + 1];
		// A flag takes a value only when the next token is not another flag —
		// so `--force add` keeps `add` as a positional rather than eating it.
		if (next !== undefined && !next.startsWith("--")) {
			flags.set(name, next);
			index += 1;
		} else {
			flags.set(name, true);
		}
	}

	return { command: positional.shift() ?? "help", positional, flags };
}

function stringFlag(
	flags: Map<string, string | true>,
	name: string,
): string | undefined {
	const value = flags.get(name);
	return typeof value === "string" ? value : undefined;
}

export function main(argv: readonly string[], cwd = process.cwd()): number {
	const { command, positional, flags } = parse(argv);

	try {
		if (command === "init") return runInit(cwd, positional, flags);
		if (command === "add") return runAdd(cwd, positional, flags);
		if (command === "list") return runList(cwd, flags);
		process.stdout.write(USAGE);
		return command === "help" ? 0 : 1;
	} catch (error) {
		process.stderr.write(
			`nebula: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

function runInit(
	cwd: string,
	_positional: readonly string[],
	flags: Map<string, string | true>,
): number {
	const requested = stringFlag(flags, "adapter") ?? "tailwind";
	if (!isAdapterName(requested)) {
		process.stderr.write(
			`nebula: unknown adapter "${requested}" — one of ${adapterNames().join(", ")}\n`,
		);
		return 1;
	}

	const result = init({
		cwd,
		adapter: requested,
		force: flags.get("force") === true,
		dryRun: flags.get("dry-run") === true,
	});

	for (const path of result.written)
		process.stdout.write(`  create  ${path}\n`);
	for (const path of result.skipped)
		process.stdout.write(`  exists  ${path}\n`);

	if (result.packages.length > 0) {
		process.stdout.write(
			`\nInstall the engine yourself:\n  pnpm add -D ${result.packages.join(" ")}\n`,
		);
	}
	if (result.commands !== null) {
		const { build, dev } = result.commands;
		process.stdout.write(
			`\nRegister the build in config/assets.ts:\n` +
				`  build:     ${build.command} ${build.args.join(" ")}\n` +
				`  devServer: ${dev.command} ${dev.args.join(" ")}\n`,
		);
	} else {
		process.stdout.write("\nNo build step — the stylesheet ships prebuilt.\n");
	}
	return 0;
}

function runAdd(
	cwd: string,
	positional: readonly string[],
	flags: Map<string, string | true>,
): number {
	if (positional.length === 0) {
		process.stderr.write(
			"nebula: name at least one component — `nebula add button`\n",
		);
		return 1;
	}

	const result = add({
		cwd,
		names: positional,
		force: flags.get("force") === true,
		dryRun: flags.get("dry-run") === true,
	});

	for (const path of result.written)
		process.stdout.write(`  create  ${path}\n`);
	for (const path of result.skipped)
		process.stdout.write(`  exists  ${path}\n`);
	if (result.skipped.length > 0) {
		process.stdout.write(
			"\nExisting files were left alone. Use --force to overwrite.\n",
		);
	}
	return 0;
}

function runList(cwd: string, flags: Map<string, string | true>): number {
	const root = packageRoot(join(cwd, "package.json"));
	const registry = loadRegistry(join(root, "registry.json"));
	const only = stringFlag(flags, "layer");

	for (const layer of ["atoms", "molecules", "organisms", "templates"]) {
		if (only !== undefined && only !== layer) continue;
		const names = registry.items
			.filter((item) => item.layer === layer)
			.map((item) => item.name);
		if (names.length === 0) continue;
		process.stdout.write(
			`\n${layer} (${names.length})\n  ${names.join(", ")}\n`,
		);
	}
	process.stdout.write("\n");
	return 0;
}
