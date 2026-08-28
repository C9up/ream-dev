/**
 * nebula's configuration — `config/nebula.ts` in a ream app.
 *
 * nebula declares **no CSS dependency at all**, not even a peer one. The app
 * installs whichever engine it wants and names it here; nebula generates the
 * stubs and the build command that match. That mirrors how AdonisJS treats its
 * asset bundler, and it is the reason `tailwindcss` does not appear in this
 * package's `package.json`.
 *
 *   // config/nebula.ts
 *   import { defineConfig } from '@c9up/nebula'
 *
 *   export default defineConfig({
 *     adapter: 'tailwind',
 *     paths: {
 *       components: 'resources/pages',
 *       css: 'resources/css/app.css',
 *       output: 'public/app.css',
 *     },
 *   })
 *
 * The paths are also what the registry copies into: `ream nebula:add button`
 * writes to `<components>/atoms/Button.ts`, because the atomic layer is a
 * property of the component, not a choice made at install time.
 */

export type AdapterName = "tailwind" | "unocss" | "css";

export interface NebulaPaths {
	/** Root of the atomic component tree. Layer directories live under it. */
	components: string;
	/** The stylesheet the adapter writes and the build compiles. */
	css: string;
	/** Where the compiled stylesheet lands. */
	output: string;
}

export interface NebulaConfig {
	/**
	 * Which CSS engine the app uses.
	 *
	 * `tailwind` and `unocss` consume the same class names, so switching
	 * between them changes the config and nothing else. `css` uses no engine:
	 * the build emits a stylesheet holding exactly the utilities nebula's
	 * components reference, and nothing has to be installed.
	 */
	adapter: AdapterName;
	paths?: Partial<NebulaPaths>;
	/**
	 * Override design tokens. Anything omitted keeps nebula's default, so a
	 * project can retune `--primary` without restating the palette.
	 */
	tokens?: Readonly<Record<string, string>>;
	/** Same, for `.dark`. */
	darkTokens?: Readonly<Record<string, string>>;
}

export interface ResolvedNebulaConfig extends NebulaConfig {
	paths: NebulaPaths;
}

export const defaultPaths: NebulaPaths = {
	components: "resources/pages",
	css: "resources/css/app.css",
	output: "public/app.css",
};

/** Type-checked config helper. Import it in `config/nebula.ts`. */
export function defineConfig(config: NebulaConfig): NebulaConfig {
	return config;
}

/** Fill in the defaults. Used by the CLI and by the adapters. */
export function resolveConfig(config: NebulaConfig): ResolvedNebulaConfig {
	return { ...config, paths: { ...defaultPaths, ...config.paths } };
}

/** The atomic layers, in dependency order. Also the registry's layer names. */
export const layers = ["atoms", "molecules", "organisms", "templates"] as const;

export type Layer = (typeof layers)[number];

export function isLayer(value: string): value is Layer {
	return layers.some((layer) => layer === value);
}
