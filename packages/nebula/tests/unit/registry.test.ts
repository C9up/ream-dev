/**
 * The registry is generated, so these guard the generator rather than a
 * hand-maintained list — and the failure they exist to catch is silent: a
 * component copied into a project with one of its imports missing does not
 * fail here, it fails in the user's build.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../../src/cli/registry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const registry = loadRegistry(join(root, "registry.json"));

function relativeImportsOf(file: string): string[] {
	const contents = readFileSync(join(root, "src", file), "utf8");
	const found: string[] = [];
	for (const match of contents.matchAll(/from\s+"(\.[^"]+)"/g)) {
		const specifier = match[1];
		if (specifier === undefined) continue;
		found.push(
			normalize(join(dirname(file), specifier.replace(/\.js$/, ".ts"))),
		);
	}
	return found;
}

describe("registry", () => {
	it("is not empty", () => {
		expect(registry.items.length).toBeGreaterThan(50);
	});

	it("names every item uniquely", () => {
		const names = registry.items.map((item) => item.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("points only at files that exist", () => {
		for (const item of registry.items) {
			for (const file of item.files) {
				expect(
					existsSync(join(root, "src", file)),
					`${item.name} → ${file}`,
				).toBe(true);
			}
		}
	});

	it("ships every import an item needs, or names the item that owns it", () => {
		const ownerOf = new Map<string, string>();
		for (const item of registry.items) {
			const entry = item.files.find((file) =>
				file.endsWith(`${item.title}.ts`),
			);
			if (entry !== undefined) ownerOf.set(entry, item.name);
		}

		for (const item of registry.items) {
			const shipped = new Set(item.files);
			const reachable = new Set([
				...item.files,
				...item.dependencies.flatMap((name) => {
					const dependency = registry.items.find(
						(candidate) => candidate.name === name,
					);
					return dependency === undefined ? [] : dependency.files;
				}),
			]);

			for (const file of shipped) {
				for (const imported of relativeImportsOf(file)) {
					expect(
						reachable.has(imported),
						`${item.name}: ${file} imports ${imported}, which is neither shipped nor pulled in by a dependency`,
					).toBe(true);
				}
			}
		}
	});

	it("resolves a dependency chain without repeating a file", () => {
		const combobox = registry.items.find((item) => item.name === "combobox");
		expect(combobox).toBeDefined();
		expect(combobox?.dependencies).toContain("command");
		expect(new Set(combobox?.files).size).toBe(combobox?.files.length);
	});

	it("files every item under an atomic layer that matches its path", () => {
		for (const item of registry.items) {
			const entry = item.files.find((file) =>
				file.endsWith(`${item.title}.ts`),
			);
			expect(entry, `${item.name} has no entry file`).toBeDefined();
			expect(
				entry?.startsWith(`${item.layer}/`),
				`${item.name} → ${entry}`,
			).toBe(true);
		}
	});

	it("never lists a barrel — they would overwrite the project's own", () => {
		for (const item of registry.items) {
			for (const file of item.files) {
				expect(file.endsWith("index.ts"), `${item.name} ships ${file}`).toBe(
					false,
				);
			}
		}
	});
});
