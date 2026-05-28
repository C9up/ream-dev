/**
 * `station.*` MCP tools.
 *
 * Static `defineResource(...)` scan via ts-morph. No app boot, no
 * @c9up/station runtime import — the dispatcher works from the user
 * source tree alone.
 */

import { Node, SyntaxKind } from "ts-morph";

import {
	findCallExpressions,
	isLoadError,
	loadProject,
} from "../util/ts-static-parser.js";
import { isStationTool, STATION_TOOLS } from "./station.descriptors.js";

export { isStationTool, STATION_TOOLS };

const RESOURCE_ACTIONS = ["list", "show", "create", "edit", "destroy"] as const;

type Confidence = "high" | "medium" | "low";

interface ResourceSite {
	name?: string;
	entity?: string;
	actions: string[];
	file: string;
	line: number;
	confidence: Confidence;
	notes: string[];
}

interface ShapedError {
	error: string;
	hint: string;
}

function shapeError(error: string, hint: string): ShapedError {
	return { error, hint };
}

export function dispatchStation(
	root: string,
	name: string,
	_args: Record<string, unknown> = {},
): unknown {
	const loaded = loadProject(root);
	if (isLoadError(loaded)) return shapeError(loaded.error, loaded.hint);
	switch (name) {
		case "station.list_resources":
			return listResources(loaded.project);
		default:
			return shapeError(
				`Unknown station tool: ${name}`,
				"This dispatcher only handles `station.list_resources`.",
			);
	}
}

function listResources(project: Parameters<typeof findCallExpressions>[0]) {
	const sites = findCallExpressions(
		project,
		(leaf) => leaf === "defineResource",
	);
	const resources: ResourceSite[] = [];
	for (const site of sites) {
		const args = site.expr.getArguments();
		const arg0 = args[0];
		const notes: string[] = [];
		let confidence: Confidence = "high";
		const resource: ResourceSite = {
			actions: [...RESOURCE_ACTIONS],
			file: site.file,
			line: site.line,
			confidence,
			notes,
		};
		if (arg0 === undefined || !Node.isObjectLiteralExpression(arg0)) {
			confidence = "low";
			notes.push(
				"defineResource called without an inline object literal — cannot statically resolve options",
			);
			resource.confidence = confidence;
			resources.push(resource);
			continue;
		}
		for (const prop of arg0.getProperties()) {
			if (!Node.isPropertyAssignment(prop)) continue;
			const key = prop.getName();
			const init = prop.getInitializer();
			if (init === undefined) continue;
			if (key === "name") {
				if (Node.isStringLiteral(init)) {
					resource.name = init.getLiteralValue();
				} else {
					confidence = "medium";
					notes.push("name is not a string literal");
				}
			} else if (key === "entity") {
				if (Node.isIdentifier(init)) {
					resource.entity = init.getText();
				} else {
					confidence = "medium";
					notes.push("entity is not a bare identifier");
					resource.entity = init.getText();
				}
			} else if (key === "actions") {
				if (init.getKind() === SyntaxKind.ArrayLiteralExpression) {
					const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
					const elements: string[] = [];
					for (const el of arr.getElements()) {
						if (Node.isStringLiteral(el)) {
							elements.push(el.getLiteralValue());
						} else {
							confidence = "medium";
							notes.push("actions array contains a non-literal entry");
						}
					}
					if (elements.length > 0) resource.actions = elements;
				} else {
					confidence = "medium";
					notes.push("actions is not an inline array literal");
				}
			}
		}
		if (resource.name === undefined && resource.entity !== undefined) {
			// defineResource() derives the name from the entity class via
			// kebab-case slugification. Static analysis can't run that
			// transform reliably without the runtime class, so flag medium
			// confidence and surface the entity reference as a fallback.
			confidence = confidence === "high" ? "medium" : confidence;
			notes.push(
				`name omitted — runtime derives kebab-case slug from entity (${resource.entity})`,
			);
		}
		resource.confidence = confidence;
		resources.push(resource);
	}
	return {
		resources,
		confidence:
			resources.length === 0 ? "high" : aggregateConfidence(resources),
		knownGaps:
			resources.length === 0
				? ["No defineResource() calls found in the project source tree."]
				: [],
	};
}

function aggregateConfidence(sites: ResourceSite[]): Confidence {
	let worst: Confidence = "high";
	for (const s of sites) {
		if (s.confidence === "low") return "low";
		if (s.confidence === "medium") worst = "medium";
	}
	return worst;
}
