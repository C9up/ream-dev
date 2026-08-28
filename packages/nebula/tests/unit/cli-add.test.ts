import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { add } from "../../src/cli/add.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let project: string;

/**
 * A throwaway project with `@c9up/nebula` linked in.
 *
 * The CLI locates the package through `require.resolve` from the project's own
 * `package.json`, which is exactly how it behaves in a real install — so the
 * link is what makes this test exercise the real resolution path rather than a
 * stubbed one.
 */
beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), "nebula-add-"));
	mkdirSync(join(project, "node_modules", "@c9up"), { recursive: true });
	writeFileSync(
		join(project, "package.json"),
		'{"name":"probe","type":"module"}',
	);
	// An absolute symlink, the way a workspace install links a local package —
	// so `require.resolve` reaches the real root with its `src/` and registry,
	// and the test exercises the resolution path a real install uses.
	symlinkSync(
		packageRoot,
		join(project, "node_modules", "@c9up", "nebula"),
		"dir",
	);
});

afterEach(() => {
	rmSync(project, { recursive: true, force: true });
});

describe("nebula add", () => {
	it("mirrors the package layout so no import needs rewriting", () => {
		add({ cwd: project, names: ["button"] });

		const button = join(project, "resources/pages/atoms/Button.ts");
		expect(existsSync(button)).toBe(true);
		// Button imports `../lib/cva.js`; the copy resolves only because the
		// shape was preserved.
		expect(existsSync(join(project, "resources/pages/lib/cva.ts"))).toBe(true);
		expect(readFileSync(button, "utf8")).toContain('from "../lib/cva.js"');
	});

	it("pulls in the components a component depends on", () => {
		add({ cwd: project, names: ["combobox"] });
		expect(
			existsSync(join(project, "resources/pages/organisms/Command.ts")),
		).toBe(true);
		expect(
			existsSync(join(project, "resources/pages/organisms/Select.ts")),
		).toBe(true);
	});

	it("copies a shared file once and does not report it as pre-existing", () => {
		// Both pull in `lib/cn.ts`. Reporting the second visit as "exists" would
		// look like a warning about the user's own edits.
		const result = add({ cwd: project, names: ["button", "badge"] });
		expect(result.skipped).toEqual([]);
		expect(result.written.filter((file) => file === "lib/cn.ts")).toHaveLength(
			1,
		);
	});

	it("never overwrites an edited file without --force", () => {
		add({ cwd: project, names: ["button"] });
		const button = join(project, "resources/pages/atoms/Button.ts");
		writeFileSync(button, "// my version\n");

		const second = add({ cwd: project, names: ["button"] });
		expect(second.skipped).toContain("atoms/Button.ts");
		expect(readFileSync(button, "utf8")).toBe("// my version\n");
	});

	it("overwrites when asked", () => {
		add({ cwd: project, names: ["button"] });
		const button = join(project, "resources/pages/atoms/Button.ts");
		writeFileSync(button, "// my version\n");

		add({ cwd: project, names: ["button"], force: true });
		expect(readFileSync(button, "utf8")).toContain("buttonVariants");
	});

	it("writes nothing on a dry run", () => {
		const result = add({ cwd: project, names: ["button"], dryRun: true });
		expect(result.written.length).toBeGreaterThan(0);
		expect(existsSync(join(project, "resources/pages/atoms/Button.ts"))).toBe(
			false,
		);
	});

	it("honours a custom component root", () => {
		add({ cwd: project, names: ["badge"], paths: { components: "app/ui" } });
		expect(existsSync(join(project, "app/ui/atoms/Badge.ts"))).toBe(true);
	});

	it("refuses an unknown name with a usable message", () => {
		expect(() => add({ cwd: project, names: ["nope"] })).toThrow(
			/unknown component "nope"/,
		);
	});
});
