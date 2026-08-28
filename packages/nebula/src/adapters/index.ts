/**
 * The three style adapters.
 *
 * All three consume the same utility class names, which is what lets one set
 * of components serve all of them. Switching is a one-word change in
 * `config/nebula.ts` followed by `ream nebula:init`.
 */

import type { AdapterName } from "../config.js";
import { cssAdapter } from "./css.js";
import { tailwindAdapter } from "./tailwind.js";
import type { StyleAdapter } from "./types.js";
import { unocssAdapter } from "./unocss.js";

export { cssAdapter } from "./css.js";
export { tailwindAdapter } from "./tailwind.js";
export type {
	AdapterCommand,
	GeneratedFile,
	StyleAdapter,
} from "./types.js";
export { unocssAdapter } from "./unocss.js";

const adapters: Readonly<Record<AdapterName, StyleAdapter>> = {
	tailwind: tailwindAdapter,
	unocss: unocssAdapter,
	css: cssAdapter,
};

export function adapterFor(name: AdapterName): StyleAdapter {
	return adapters[name];
}

export function adapterNames(): readonly AdapterName[] {
	return Object.keys(adapters).filter(isAdapterName);
}

export function isAdapterName(value: string): value is AdapterName {
	return value === "tailwind" || value === "unocss" || value === "css";
}
