/**
 * Tailwind CSS v4 adapter.
 *
 * The default, and the one shadcn itself targets — so the class strings in
 * nebula's components are exactly the ones upstream uses, and a shadcn example
 * pasted into a nebula project renders the same.
 *
 * v4 is configured in CSS rather than a JS config file, which is why this
 * emits a stylesheet and no `tailwind.config.js`. Three directives do the
 * work:
 *
 * - `@source` points the scanner at the copied components. Without it Tailwind
 *   never sees `bg-primary` and emits none of it — the single most common way
 *   a v4 setup produces an unstyled page.
 * - `@custom-variant dark` makes `dark:` respond to a `.dark` class rather
 *   than the system preference, so a theme toggle can override the OS.
 * - `@theme inline` maps nebula's plain custom properties onto Tailwind's
 *   colour namespace, which is what turns `--primary` into a `bg-primary`
 *   utility.
 *
 * The build runs through `@tailwindcss/cli`, matching the aurora apps already
 * in this workspace.
 */

import type { ResolvedNebulaConfig } from "../config.js";
import type { GeneratedFile, StyleAdapter } from "./types.js";

function stylesheet(config: ResolvedNebulaConfig): string {
	return `@import "tailwindcss";
@import "@c9up/nebula/theme.css";

/* Scan the component tree so the utilities they use are emitted. */
@source "${relativeFromCss(config)}";

/* Class-based dark mode: \`dark:\` applies under any \`.dark\` ancestor. */
@custom-variant dark (&:is(.dark *));

/*
 * Map nebula's tokens onto Tailwind's namespaces.
 *
 * \`inline\` matters: without it Tailwind copies the *values* at build time and
 * the \`.dark\` overrides never reach the utilities, so dark mode changes the
 * custom properties and nothing else.
 */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
`;
}

/**
 * `@source` is resolved relative to the stylesheet, not the project root.
 *
 * The two are rarely the same — `resources/css/app.css` scanning
 * `resources/pages` needs `../pages` — and getting it wrong fails silently:
 * Tailwind finds no files, emits no utilities, and the page renders unstyled
 * with no error anywhere.
 */
function relativeFromCss(config: ResolvedNebulaConfig): string {
	const cssDirectory = config.paths.css.split("/").slice(0, -1);
	const target = config.paths.components.split("/");

	let shared = 0;
	while (
		shared < cssDirectory.length &&
		shared < target.length &&
		cssDirectory[shared] === target[shared]
	) {
		shared += 1;
	}

	const up = new Array(cssDirectory.length - shared).fill("..");
	return [...up, ...target.slice(shared)].join("/");
}

export const tailwindAdapter: StyleAdapter = {
	name: "tailwind",
	summary: "Tailwind CSS v4, configured in CSS. What shadcn/ui itself targets.",
	packages: ["tailwindcss", "@tailwindcss/cli"],

	files(config: ResolvedNebulaConfig): readonly GeneratedFile[] {
		return [
			{
				path: config.paths.css,
				contents: stylesheet(config),
				skipIfExists: true,
			},
		];
	},

	commands(config) {
		const base = ["-i", config.paths.css, "-o", config.paths.output];
		return {
			build: { command: "tailwindcss", args: base },
			dev: { command: "tailwindcss", args: [...base, "--watch"] },
		};
	},
};
