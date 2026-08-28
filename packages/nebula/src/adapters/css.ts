/**
 * The engine-free adapter.
 *
 * No Tailwind, no UnoCSS, no build step in the app at all: nebula ships a
 * prebuilt `nebula.css` holding exactly the utilities its own components
 * reference, and the app imports it.
 *
 * **Where the compilation actually happens.** nebula's own release build runs
 * Tailwind over `src/**` and freezes the result (`scripts/build-css.ts`).
 * Tailwind is therefore a devDependency *of nebula* and never reaches the
 * app's dependency tree — which is the whole point. The set of utilities is
 * knowable ahead of time because the components are nebula's, and they do not
 * change between one app's install and another's.
 *
 * **The limitation, stated plainly.** The frozen stylesheet covers the
 * components as nebula wrote them. The registry copies those sources into the
 * app for the user to edit, and the moment an edit introduces a utility nebula
 * never used — `bg-emerald-500`, `grid-cols-7` — nothing emits it, and the
 * class silently does nothing.
 *
 * So this adapter suits an app that takes the components as they are and
 * writes its own hand-rolled CSS around them. An app that intends to retune
 * components through their class strings wants `tailwind` or `unocss`, where
 * the scanner sees the edits.
 *
 * Lifting that limitation means compiling the app's copied sources too — a
 * utility scanner and a CSS emitter over the finite surface nebula uses. That
 * is a build-time, string-heavy, run-on-every-build job, which is the profile
 * where moving it into `ream-cli` (Rust) pays; it is the one part of nebula
 * where Rust would earn its place.
 */

import type { ResolvedNebulaConfig } from "../config.js";
import type { GeneratedFile, StyleAdapter } from "./types.js";

function stylesheet(): string {
	return `/*
 * nebula, engine-free.
 *
 * \`nebula.css\` is prebuilt and shipped with the package — no scanner runs in
 * this project, so nothing here needs a build step.
 *
 * It covers nebula's components as published. A utility you add to a copied
 * component will not be emitted; write the rule below by hand, or switch the
 * adapter in \`config/nebula.ts\` to \`tailwind\` or \`unocss\`.
 */
@import "@c9up/nebula/nebula.css";

/* Your own styles go here. */
`;
}

export const cssAdapter: StyleAdapter = {
	name: "css",
	summary:
		"No engine and no build step — nebula's prebuilt stylesheet, imported as-is.",
	packages: [],

	files(config: ResolvedNebulaConfig): readonly GeneratedFile[] {
		return [
			{ path: config.paths.css, contents: stylesheet(), skipIfExists: true },
		];
	},

	/**
	 * Nothing to compile.
	 *
	 * `null` rather than a copy command: the app serves the stylesheet straight
	 * from the package, so there is no compile step for `ream build` to run and
	 * none should be registered.
	 */
	commands(): null {
		return null;
	},
};
