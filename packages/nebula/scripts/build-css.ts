/**
 * Freeze nebula's own stylesheet for the engine-free adapter.
 *
 * Runs Tailwind over nebula's sources and writes `nebula.css`, which the `css`
 * adapter ships and apps import directly. Tailwind is a devDependency **of
 * nebula** — it runs here, at release time, and never reaches an app's
 * dependency tree. That is what lets the `css` adapter promise no engine and
 * no build step without anybody hand-writing a stylesheet.
 *
 * The temporary entry is generated rather than kept in the repo: it exists
 * only to give Tailwind an `@source` pointing at `src/`, and a checked-in copy
 * would be one more thing to keep in step with `theme.css`.
 *
 * Run with `pnpm css`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "nebula.css");

const workspace = mkdtempSync(join(tmpdir(), "nebula-css-"));
const entry = join(workspace, "entry.css");

writeFileSync(
	entry,
	`@import "tailwindcss";
@import "${join(root, "theme.css")}";
@source "${join(root, "src")}";
@custom-variant dark (&:is(.dark *));
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
`,
);

try {
	execFileSync(
		process.env.NEBULA_TAILWIND ?? "tailwindcss",
		["-i", entry, "-o", output, "--minify"],
		{ stdio: "inherit" },
	);
	console.log(`nebula.css written`);
} finally {
	rmSync(workspace, { recursive: true, force: true });
}
