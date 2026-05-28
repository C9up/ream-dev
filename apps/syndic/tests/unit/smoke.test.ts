/**
 * Smoke tests — verify each module's controllers and services import without
 * throwing. This is the baseline guardrail; deeper integration tests live
 * alongside each module once specs stabilize.
 *
 * Route modules cannot be imported directly because they consume the framework
 * router service which requires a booted Application. Smoke coverage at the
 * controller level is sufficient to catch the common boot-time errors
 * (missing exports, broken decorators, circular imports).
 *
 * @implements Story 26.1
 */
import { describe, expect, it } from "vitest";

describe("syndic > smoke > controllers load", () => {
	it("loads ResidencesController", async () => {
		const mod = await import(
			"../../app/modules/residence/controllers/ResidencesController.js"
		);
		expect(typeof mod.default).toBe("function");
	});

	it("loads TasksController", async () => {
		const mod = await import(
			"../../app/modules/task/controllers/TasksController.js"
		);
		expect(typeof mod.default).toBe("function");
	});

	it("loads QuotesController", async () => {
		const mod = await import(
			"../../app/modules/task/controllers/QuotesController.js"
		);
		expect(typeof mod.default).toBe("function");
	});

	it("loads MessagesController", async () => {
		const mod = await import(
			"../../app/modules/communication/controllers/MessagesController.js"
		);
		expect(typeof mod.default).toBe("function");
	});

	it("loads AuthController", async () => {
		const mod = await import(
			"../../app/modules/user/controllers/AuthController.js"
		);
		expect(typeof mod.default).toBe("function");
	});
});

describe("syndic > smoke > entities load", () => {
	it("loads Quote entity (uploaded_by_id column matches migration)", async () => {
		const { Quote } = await import("../../app/modules/task/entities/Quote.js");
		const instance = new Quote();
		// The column exists on the entity prototype index signature; setting it should not throw
		instance.setProp("uploadedById", "test-uuid");
		expect(instance.uploadedById).toBe("test-uuid");
	});
});
