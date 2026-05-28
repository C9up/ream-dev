import { InkerRenderError } from "./InkerRenderError.js";

export interface ResolvePathContext {
	readonly templatePath?: string;
	readonly templateName?: string;
	readonly line?: number;
	readonly column?: number;
	readonly expression?: string;
}

function isPlainObjectIndexable(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatConsumed(consumed: ReadonlyArray<string | number>): string {
	const parts = consumed.map((seg) =>
		typeof seg === "number" ? String(seg) : JSON.stringify(seg),
	);
	return `[${parts.join(", ")}]`;
}

function fullPathLabel(path: ReadonlyArray<string | number>): string {
	let out = "";
	for (let i = 0; i < path.length; i += 1) {
		const seg = path[i];
		if (typeof seg === "number") {
			out += `[${seg}]`;
		} else if (i === 0) {
			out = seg;
		} else {
			out += `.${seg}`;
		}
	}
	return out;
}

export function resolvePath(
	data: Readonly<Record<string, unknown>>,
	path: ReadonlyArray<string | number>,
	context: ResolvePathContext = {},
): unknown {
	let current: unknown = data;
	const consumed: Array<string | number> = [];

	for (let i = 0; i < path.length; i += 1) {
		const segment = path[i];
		const isLast = i === path.length - 1;

		if (current === null || current === undefined) {
			const label = fullPathLabel(path);
			throw new InkerRenderError(
				"E_INKER_UNKNOWN_IDENTIFIER",
				`Unknown identifier '${label}' — got ${current === null ? "null" : "undefined"} at ${formatConsumed(consumed)}`,
				{
					line: context.line,
					column: context.column,
					expression: context.expression ?? label,
					templatePath: context.templatePath,
					templateName: context.templateName,
				},
			);
		}

		if (typeof segment === "number") {
			if (!Array.isArray(current)) {
				const label = fullPathLabel(path);
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_IDENTIFIER",
					`Unknown identifier '${label}' — numeric index ${segment} against non-array at ${formatConsumed(consumed)}`,
					{
						line: context.line,
						column: context.column,
						expression: context.expression ?? label,
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
			if (segment < 0 || segment >= current.length) {
				const label = fullPathLabel(path);
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_IDENTIFIER",
					`Unknown identifier '${label}' — index ${segment} out of range (length ${current.length}) at ${formatConsumed(consumed)}`,
					{
						line: context.line,
						column: context.column,
						expression: context.expression ?? label,
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
			// Sparse-array hole guard: bounds OK but the slot is not an own property.
			// Without this, `[1, , 3]` at index 1 would silently render empty —
			// inconsistent with the object-branch's Object.hasOwn strictness.
			if (!Object.hasOwn(current, segment)) {
				const label = fullPathLabel(path);
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_IDENTIFIER",
					`Unknown identifier '${label}' — array index ${segment} is a sparse hole at ${formatConsumed(consumed)}`,
					{
						line: context.line,
						column: context.column,
						expression: context.expression ?? label,
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
			current = current[segment];
		} else {
			if (!isPlainObjectIndexable(current)) {
				const label = fullPathLabel(path);
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_IDENTIFIER",
					`Unknown identifier '${label}' — string segment '${segment}' against non-object at ${formatConsumed(consumed)}`,
					{
						line: context.line,
						column: context.column,
						expression: context.expression ?? label,
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
			if (!Object.hasOwn(current, segment)) {
				const label = fullPathLabel(path);
				throw new InkerRenderError(
					"E_INKER_UNKNOWN_IDENTIFIER",
					`Unknown identifier '${label}' — own property '${segment}' missing at ${formatConsumed(consumed)}`,
					{
						line: context.line,
						column: context.column,
						expression: context.expression ?? label,
						templatePath: context.templatePath,
						templateName: context.templateName,
					},
				);
			}
			current = current[segment];
		}

		consumed.push(segment);

		if (isLast) {
			return current;
		}
	}

	return current;
}
