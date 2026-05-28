import { defineConfig } from "@c9up/ream";

export default defineConfig({
	providers: [
		() => import("@c9up/spectrum/provider"),
		() => import("@c9up/atlas/provider"),
		() => import("@c9up/pulsar/provider"),
		() => import("@c9up/warden/provider"),
	],

	preloads: [() => import("./start/kernel.js")],

	modules: {
		path: "./app/modules",
	},
});
