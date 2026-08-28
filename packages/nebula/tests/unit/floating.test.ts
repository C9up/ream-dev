import { describe, expect, it } from "vitest";
import { resolvePosition } from "../../src/primitives/floating.js";

const viewport = { width: 1000, height: 800 };
const surface = { x: 0, y: 0, width: 200, height: 100 };

describe("resolvePosition", () => {
	it("places a bottom-aligned surface under the anchor", () => {
		const anchor = { x: 400, y: 300, width: 100, height: 40 };
		const position = resolvePosition(anchor, surface, viewport, { offset: 4 });
		expect(position.side).toBe("bottom");
		expect(position.y).toBe(344);
		// Centre alignment: (100 - 200) / 2 = -50 from the anchor's left.
		expect(position.x).toBe(350);
	});

	it("aligns to the anchor's edges for start and end", () => {
		const anchor = { x: 400, y: 300, width: 100, height: 40 };
		expect(
			resolvePosition(anchor, surface, viewport, { placement: "bottom-start" })
				.x,
		).toBe(400);
		expect(
			resolvePosition(anchor, surface, viewport, { placement: "bottom-end" }).x,
		).toBe(300);
	});

	it("flips to the opposite side when the preferred one does not fit", () => {
		// 40px of room below, 700 above — a 100px surface cannot go below.
		const anchor = { x: 400, y: 700, width: 100, height: 40 };
		expect(resolvePosition(anchor, surface, viewport).side).toBe("top");
	});

	it("keeps the preferred side when it fits, even with more room opposite", () => {
		// Room below is 460 and above is 300: both fit, so no flip. Flipping on
		// "more room" alone would move surfaces around for no reason.
		const anchor = { x: 400, y: 300, width: 100, height: 40 };
		expect(resolvePosition(anchor, surface, viewport).side).toBe("bottom");
	});

	it("picks the roomier side when neither fits", () => {
		const tall = { x: 0, y: 0, width: 200, height: 900 };
		const anchor = { x: 400, y: 600, width: 100, height: 40 };
		expect(resolvePosition(anchor, tall, viewport).side).toBe("top");
	});

	it("shifts a surface back inside the viewport", () => {
		const anchor = { x: 960, y: 300, width: 40, height: 40 };
		const position = resolvePosition(anchor, surface, viewport, { padding: 8 });
		expect(position.x).toBe(viewport.width - surface.width - 8);
	});

	it("pins the leading edge when the surface is wider than the viewport", () => {
		const wide = { x: 0, y: 0, width: 1200, height: 100 };
		const anchor = { x: 400, y: 300, width: 100, height: 40 };
		// The clamp's max falls below its min here; honouring max would push the
		// readable start of the surface off screen.
		expect(resolvePosition(anchor, wide, viewport, { padding: 8 }).x).toBe(8);
	});

	it("reports the height available on the resolved side", () => {
		const anchor = { x: 400, y: 300, width: 100, height: 40 };
		const position = resolvePosition(anchor, surface, viewport, {
			offset: 4,
			padding: 8,
		});
		expect(position.availableHeight).toBe(800 - 340 - 4 - 8);
	});

	it("centres the arrow on the anchor, not on the shifted surface", () => {
		const anchor = { x: 900, y: 300, width: 40, height: 40 };
		const position = resolvePosition(anchor, surface, viewport, {
			padding: 8,
			arrowSize: 10,
		});
		// Centring on the surface would put the arrow at its middle, 100. It has
		// to follow the anchor instead: surface shifted to x=792, anchor centre
		// at 920, so the arrow sits 123 in from the surface's left edge.
		expect(position.arrow?.x).toBe(123);
	});

	it("keeps the arrow clear of the corners", () => {
		const anchor = { x: 10, y: 300, width: 20, height: 40 };
		const position = resolvePosition(anchor, surface, viewport, {
			padding: 8,
			arrowSize: 10,
		});
		expect(position.arrow?.x).toBeGreaterThanOrEqual(8);
	});
});
