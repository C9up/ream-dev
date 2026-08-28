/**
 * The style-adapter contract.
 *
 * An adapter answers three questions and nothing else:
 *
 * 1. What does the app need to install? nebula never installs it — the app
 *    owns its dependencies, and a UI library quietly adding a build tool to
 *    someone's `package.json` is how a dependency tree gets away from them.
 * 2. What files should exist? The stylesheet entry, and any engine config.
 * 3. What command compiles them? Handed to ream's `assets` config, which
 *    `ream dev` and `ream build` already run — the same hook AdonisJS uses for
 *    its bundler.
 *
 * Deliberately not in the contract: anything that would change how a component
 * is written. All three adapters consume the same utility class names, which
 * is what keeps one set of fifty-odd components serving all of them. An engine
 * with a different authoring model — Panda's recipes, StyleX's compile-time
 * API — cannot be added behind this interface, and pretending otherwise would
 * mean a second version of every component.
 */

import type { ResolvedNebulaConfig } from "../config.js";

export interface GeneratedFile {
	/** Path relative to the project root. */
	path: string;
	contents: string;
	/**
	 * Leave an existing file alone. True for anything the user is expected to
	 * edit — their stylesheet is theirs once it exists.
	 */
	skipIfExists: boolean;
}

export interface AdapterCommand {
	command: string;
	args: readonly string[];
}

export interface StyleAdapter {
	readonly name: string;
	/** One-line summary, printed by `nebula init`. */
	readonly summary: string;
	/** Packages the app must add itself. Empty for an engine-free adapter. */
	readonly packages: readonly string[];
	/** Stubs to write. */
	files(config: ResolvedNebulaConfig): readonly GeneratedFile[];
	/** Build and watch commands, or `null` when there is nothing to compile. */
	commands(config: ResolvedNebulaConfig): {
		build: AdapterCommand;
		dev: AdapterCommand;
	} | null;
}
