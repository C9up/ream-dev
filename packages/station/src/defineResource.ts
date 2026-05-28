import { kebabCase, pluralise, titleCase } from "./casing.js";
import {
	type AuditSink,
	type FormFieldOverride,
	type PolicyFn,
	RESOURCE_ACTIONS,
	type Resource,
	type ResourceAction,
	type ResourceOptions,
} from "./types.js";

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const ACTION_LOOKUP: ReadonlySet<string> = new Set(RESOURCE_ACTIONS);

function isResourceAction(value: unknown): value is ResourceAction {
	return typeof value === "string" && ACTION_LOOKUP.has(value);
}

/**
 * Build a frozen `Resource` from a developer's declaration.
 *
 * Validation is fail-fast and pre-HTTP: a typo in `actions` or `name` throws
 * here, not at request time, so the offending key surfaces in boot logs.
 */
export function defineResource<T>(options: ResourceOptions<T>): Resource<T> {
	if (typeof options.entity !== "function") {
		throw new TypeError(
			"[station] defineResource: 'entity' must be a class constructor",
		);
	}

	if (options.actions !== undefined) {
		if (!Array.isArray(options.actions) || options.actions.length === 0) {
			throw new Error(
				"[station] defineResource: 'actions' must contain at least one action",
			);
		}
		for (const action of options.actions) {
			if (!isResourceAction(action)) {
				throw new Error(
					`[station] defineResource: unknown action '${String(action)}' (allowed: list, show, create, edit, destroy)`,
				);
			}
		}
	}

	if (options.name !== undefined && !NAME_PATTERN.test(options.name)) {
		throw new Error(
			`[station] defineResource: 'name' must be lowercase kebab-case (got: '${options.name}')`,
		);
	}

	const entityName = options.entity.name;
	if (entityName === "") {
		throw new Error(
			"[station] defineResource: 'entity' class has no name (anonymous class); pass 'name:' explicitly",
		);
	}
	const slugBase = kebabCase(entityName);
	const name = options.name ?? pluralise(slugBase);
	if (options.name === undefined && !NAME_PATTERN.test(name)) {
		throw new Error(
			`[station] defineResource: entity name '${entityName}' produces invalid slug '${name}'; pass 'name:' explicitly to override`,
		);
	}
	const label = options.label ?? titleCase(pluralise(slugBase));

	const enabled: ReadonlySet<ResourceAction> =
		options.actions === undefined
			? new Set<ResourceAction>(RESOURCE_ACTIONS)
			: new Set<ResourceAction>(options.actions);

	const orderedActions: ReadonlyArray<ResourceAction> = Object.freeze(
		RESOURCE_ACTIONS.filter((action) => enabled.has(action)),
	);

	// 54.4: validate policies — each key must be a known action, each
	// value must be a function. Frozen at build time; no policy entry
	// means "allow this action" (open default + boot-time warn-once,
	// see StationProvider).
	const policiesRaw = options.policies ?? {};
	const policies: Partial<Record<ResourceAction, PolicyFn>> = {};
	for (const [key, fn] of Object.entries(policiesRaw)) {
		if (!isResourceAction(key)) {
			throw new Error(
				`[station] defineResource: 'policies' contains unknown action '${key}' (allowed: list, show, create, edit, destroy)`,
			);
		}
		if (typeof fn !== "function") {
			throw new TypeError(
				`[station] defineResource: 'policies.${key}' must be a function (got ${typeof fn})`,
			);
		}
		policies[key] = fn;
	}

	// 54.5: validate per-field overrides — keyed by camelCase property
	// name on the entity. Validation is shape-only here; the inferred
	// form vs override merge happens at render time in views/form.ts.
	const formFieldsRaw = options.formFields ?? {};
	const formFields: Record<string, FormFieldOverride> = {};
	for (const [field, override] of Object.entries(formFieldsRaw)) {
		if (override === null || typeof override !== "object") {
			throw new TypeError(
				`[station] defineResource: 'formFields.${field}' must be an object`,
			);
		}
		formFields[field] = override;
	}

	// 54.6: audit sink shape-check — if provided, must be callable. No
	// extra validation; the sink is exercised lazily on first write.
	let audit: AuditSink | undefined;
	if (options.audit !== undefined) {
		if (typeof options.audit !== "function") {
			throw new TypeError(
				`[station] defineResource: 'audit' must be a function (got ${typeof options.audit})`,
			);
		}
		audit = options.audit;
	}

	const resource: Resource<T> = {
		entity: options.entity,
		name,
		label,
		actions: orderedActions,
		policies: Object.freeze(policies),
		audit,
		formFields: Object.freeze(formFields),
	};

	return Object.freeze(resource);
}
