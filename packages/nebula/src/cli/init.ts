/**
 * `nebula init` — write the config, the adapter's stubs, and the tokens.
 *
 * Three things land in the project:
 *
 * 1. `config/nebula.ts`, so the adapter choice is recorded where the app can
 *    see it and `nebula init` can be re-run after changing it.
 * 2. Whatever the chosen adapter emits — a Tailwind stylesheet, a `uno.config
 *    .ts`, or an import of the prebuilt sheet.
 * 3. Instructions: the packages to install and the build command to register.
 *
 * Nothing is installed and no `package.json` is edited. A UI library adding a
 * build tool to someone's dependency tree, or rewriting their scripts, is the
 * behaviour that makes a generator something people run once and then avoid.
 * The commands are printed for the user to place.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AdapterCommand, adapterFor } from "../adapters/index.js";
import { type AdapterName, resolveConfig } from "../config.js";

export interface InitOptions {
	cwd: string;
	adapter: AdapterName;
	force?: boolean;
	dryRun?: boolean;
}

export interface InitResult {
	written: string[];
	skipped: string[];
	packages: readonly string[];
	commands: { build: AdapterCommand; dev: AdapterCommand } | null;
}

function configFile(adapter: AdapterName): string {
	return `import { defineConfig } from '@c9up/nebula'

/**
 * nebula — component registry and style adapter.
 *
 * Changing \`adapter\` and re-running \`nebula init\` swaps the CSS engine.
 * The components themselves are untouched: all three adapters consume the same
 * class names.
 */
export default defineConfig({
  adapter: '${adapter}',
  paths: {
    // Where \`nebula add\` copies components. The atomic layers live under it.
    components: 'resources/pages',
    css: 'resources/css/app.css',
    output: 'public/app.css',
  },
})
`;
}

export function init(options: InitOptions): InitResult {
	const config = resolveConfig({ adapter: options.adapter });
	const adapter = adapterFor(options.adapter);

	const files = [
		{
			path: "config/nebula.ts",
			contents: configFile(options.adapter),
			skipIfExists: true,
		},
		...adapter.files(config),
	];

	const written: string[] = [];
	const skipped: string[] = [];

	for (const file of files) {
		const target = join(options.cwd, file.path);
		if (existsSync(target) && file.skipIfExists && options.force !== true) {
			skipped.push(file.path);
			continue;
		}
		written.push(file.path);
		if (options.dryRun === true) continue;

		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, file.contents);
	}

	return {
		written,
		skipped,
		packages: adapter.packages,
		commands: adapter.commands(config),
	};
}
