import { describe, expect, it } from "vitest";
import {
	adapterFor,
	adapterNames,
	isAdapterName,
} from "../../src/adapters/index.js";
import { resolveConfig } from "../../src/config.js";

describe("style adapters", () => {
	it("offers exactly the three implemented engines", () => {
		expect([...adapterNames()].sort()).toEqual(["css", "tailwind", "unocss"]);
		expect(isAdapterName("panda")).toBe(false);
	});

	it("declares packages the app installs itself, never nebula", () => {
		// The point of the adapter model: nebula has no CSS dependency and never
		// adds one to the app's tree on its behalf.
		expect(adapterFor("tailwind").packages).toContain("tailwindcss");
		expect(adapterFor("unocss").packages).toContain("unocss");
		expect(adapterFor("css").packages).toEqual([]);
	});

	it("resolves @source relative to the stylesheet, not the project root", () => {
		// The failure this guards is silent: a wrong path means Tailwind scans
		// nothing, emits no utilities, and the page renders unstyled with no
		// error printed anywhere.
		const config = resolveConfig({
			adapter: "tailwind",
			paths: { css: "resources/css/app.css", components: "resources/pages" },
		});
		const [stylesheet] = adapterFor("tailwind").files(config);
		expect(stylesheet?.contents).toContain('@source "../pages"');
	});

	it("handles a stylesheet and a component root that share no directory", () => {
		const config = resolveConfig({
			adapter: "tailwind",
			paths: { css: "assets/styles/main.css", components: "app/ui" },
		});
		const [stylesheet] = adapterFor("tailwind").files(config);
		expect(stylesheet?.contents).toContain('@source "../../app/ui"');
	});

	it("maps tokens with @theme inline so dark mode reaches the utilities", () => {
		const config = resolveConfig({ adapter: "tailwind" });
		const [stylesheet] = adapterFor("tailwind").files(config);
		// Without `inline`, Tailwind copies the values at build time and the
		// `.dark` overrides never affect a single utility.
		expect(stylesheet?.contents).toContain("@theme inline");
		expect(stylesheet?.contents).toContain("--color-primary: var(--primary)");
	});

	it("gives the engines a build and a watch command, and the css adapter none", () => {
		const config = resolveConfig({ adapter: "tailwind" });
		const tailwind = adapterFor("tailwind").commands(config);
		expect(tailwind?.build.args).toContain("public/app.css");
		expect(tailwind?.dev.args).toContain("--watch");
		expect(adapterFor("css").commands(config)).toBeNull();
	});

	it("never overwrites a stylesheet the user already owns", () => {
		const config = resolveConfig({ adapter: "tailwind" });
		for (const file of adapterFor("tailwind").files(config)) {
			expect(file.skipIfExists).toBe(true);
		}
	});
});
