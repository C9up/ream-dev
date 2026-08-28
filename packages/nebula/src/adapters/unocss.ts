/**
 * UnoCSS adapter.
 *
 * `presetWind4` implements Tailwind v4's utility syntax, so nebula's component
 * sources are unchanged between this adapter and the Tailwind one — the whole
 * reason both can be offered without a second set of components.
 *
 * What differs is the config format. UnoCSS is configured in JavaScript rather
 * than CSS, so the theme mapping that `@theme inline` expresses for Tailwind
 * is a `theme` object here, and the token definitions come in through
 * `preflights` since UnoCSS has no `@import` of its own.
 *
 * The tokens still come from `theme.css`. One file remains the source of truth
 * for the palette; only the plumbing around it changes.
 */

import type { ResolvedNebulaConfig } from "../config.js";
import type { GeneratedFile, StyleAdapter } from "./types.js";

const CONFIG_PATH = "uno.config.ts";

function unoConfig(config: ResolvedNebulaConfig): string {
	return `import { defineConfig, presetWind4 } from 'unocss'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/*
 * nebula's tokens, read from the package rather than copied.
 *
 * UnoCSS has no \`@import\`, so the custom properties are injected as a
 * preflight. Reading the file keeps one source of truth for the palette —
 * copying it here would drift the moment nebula retunes a colour.
 */
const tokens = readFileSync(require.resolve('@c9up/nebula/theme.css'), 'utf8')

/**
 * Map a token to a colour the utilities can reach.
 *
 * The indirection through \`var()\` is what makes dark mode work: the utility
 * resolves the variable at paint time, so a \`.dark\` ancestor redefining it
 * changes the rendered colour without a second stylesheet.
 */
const color = (name: string) => \`var(--\${name})\`

export default defineConfig({
  presets: [presetWind4()],
  content: {
    filesystem: ['${config.paths.components}/**/*.{ts,js}'],
  },
  preflights: [{ getCSS: () => tokens }],
  // \`dark:\` follows a \`.dark\` class, so a theme toggle can override the OS.
  darkMode: 'class',
  theme: {
    colors: {
      background: color('background'),
      foreground: color('foreground'),
      card: { DEFAULT: color('card'), foreground: color('card-foreground') },
      popover: { DEFAULT: color('popover'), foreground: color('popover-foreground') },
      primary: { DEFAULT: color('primary'), foreground: color('primary-foreground') },
      secondary: { DEFAULT: color('secondary'), foreground: color('secondary-foreground') },
      muted: { DEFAULT: color('muted'), foreground: color('muted-foreground') },
      accent: { DEFAULT: color('accent'), foreground: color('accent-foreground') },
      destructive: { DEFAULT: color('destructive'), foreground: color('destructive-foreground') },
      border: color('border'),
      input: color('input'),
      ring: color('ring'),
      chart: {
        1: color('chart-1'),
        2: color('chart-2'),
        3: color('chart-3'),
        4: color('chart-4'),
        5: color('chart-5'),
      },
      sidebar: {
        DEFAULT: color('sidebar'),
        foreground: color('sidebar-foreground'),
        primary: color('sidebar-primary'),
        accent: color('sidebar-accent'),
        border: color('sidebar-border'),
        ring: color('sidebar-ring'),
      },
    },
    radius: {
      sm: 'calc(var(--radius) - 4px)',
      md: 'calc(var(--radius) - 2px)',
      lg: 'var(--radius)',
      xl: 'calc(var(--radius) + 4px)',
    },
  },
})
`;
}

export const unocssAdapter: StyleAdapter = {
	name: "unocss",
	summary:
		"UnoCSS with presetWind4 — same class syntax, no PostCSS, faster builds.",
	packages: ["unocss", "@unocss/cli"],

	files(config: ResolvedNebulaConfig): readonly GeneratedFile[] {
		return [
			{ path: CONFIG_PATH, contents: unoConfig(config), skipIfExists: true },
		];
	},

	commands(config) {
		const patterns = `${config.paths.components}/**/*.{ts,js}`;
		const base = [patterns, "-o", config.paths.output];
		return {
			build: { command: "unocss", args: base },
			dev: { command: "unocss", args: [...base, "--watch"] },
		};
	},
};
