export type ResourceAction = "list" | "show" | "create" | "edit" | "destroy";

export const RESOURCE_ACTIONS: ReadonlyArray<ResourceAction> = Object.freeze([
	"list",
	"show",
	"create",
	"edit",
	"destroy",
]);

/**
 * Per-action policy gate (Story 54.4). Receives a minimal context with
 * the requesting user (when known), the affected row (for show / edit /
 * destroy), and the action being authorised. Returning `false` (or a
 * rejected promise resolving to `false`) yields HTTP 403 BEFORE the
 * action's body runs. Throw to short-circuit with a 500 — reserve that
 * for genuine bugs, not for normal "not allowed" outcomes.
 *
 * The `row` payload is intentionally typed `unknown` rather than
 * threaded through the entity generic. Threading the generic forced
 * `Resource<User>` to NOT be assignable to `Resource<unknown>`
 * (contravariance on the function parameter), which broke every view
 * caller that took a `Resource<unknown>` input. App-side policies cast
 * `row` to the entity shape they declared in `defineResource`.
 */
export type PolicyFn = (ctx: PolicyContext) => boolean | Promise<boolean>;

export interface PolicyContext {
	/** The action being authorised. */
	readonly action: ResourceAction;
	/**
	 * The authenticated user, if `ctx.auth.user` was attached upstream
	 * (Warden). Undefined for anonymous requests.
	 */
	readonly user?: { readonly id: unknown; readonly [key: string]: unknown };
	/**
	 * The row being acted on. Present for `show` / `edit` / `destroy`
	 * (after the row was loaded from the DB). Undefined for `list` /
	 * `create`. Type-erased at the Resource boundary — app-side policies
	 * narrow with a local cast.
	 */
	readonly row?: unknown;
	/** Raw query string of the incoming request — handy for filter checks. */
	readonly query: Readonly<Record<string, string | undefined>>;
	/**
	 * URL path of the incoming request. Useful when a policy needs to
	 * distinguish nested resources.
	 */
	readonly path: string;
}

/**
 * Audit-trail event (Story 54.6). Emitted AFTER a write action lands
 * successfully — on a 4xx/5xx the event does not fire (the action's
 * effect is the boundary). `before` is present for `edit` and
 * `destroy`; `after` is present for `create` and `edit`.
 */
export interface AuditEvent {
	readonly action: ResourceAction;
	readonly resource: string;
	readonly recordId?: unknown;
	readonly userId?: unknown;
	readonly before?: Readonly<Record<string, unknown>>;
	readonly after?: Readonly<Record<string, unknown>>;
	readonly at: Date;
}

export type AuditSink = (event: AuditEvent) => void | Promise<void>;

/**
 * Per-field override for the auto-generated form (Story 54.5). Station
 * infers the form from the entity's `@Column` metadata; consumers can
 * override one column at a time without losing the inference for the
 * others.
 */
export interface FormFieldOverride {
	/** Hide the field from the form entirely (still rendered on show). */
	hidden?: boolean;
	/** Override the rendered `<input type>`. */
	inputType?:
		| "text"
		| "number"
		| "email"
		| "password"
		| "date"
		| "datetime-local"
		| "checkbox"
		| "textarea";
	/** Override the visible label (defaults to the column name title-cased). */
	label?: string;
	/** Add an `<input placeholder>`. */
	placeholder?: string;
	/** Mark the field as required at the HTML level. */
	required?: boolean;
}

export interface ResourceOptions<TEntity> {
	/** Entity class (Atlas `@Entity()`-decorated constructor). */
	entity: new (
		...args: never[]
	) => TEntity;
	/** Human-readable label shown in the admin sidebar (e.g. "Users"). */
	label?: string;
	/** Subset of actions to mount. Default: all five. */
	actions?: ReadonlyArray<ResourceAction>;
	/** URL slug override. Default: derived from the entity class name. */
	name?: string;
	/**
	 * Per-action policy gates (Story 54.4). Any action without a policy
	 * defaults to "allow" — Station logs a warn-once at boot when at
	 * least one resource has no policies wired, so apps know they're
	 * relying on the open default.
	 */
	policies?: Partial<Record<ResourceAction, PolicyFn>>;
	/**
	 * Audit sink invoked AFTER each successful write (Story 54.6). When
	 * omitted, Station falls back to a once-per-process stderr warning
	 * so apps don't silently lose audit visibility.
	 */
	audit?: AuditSink;
	/**
	 * Per-field overrides on top of the inferred form (Story 54.5).
	 * Keyed by the entity's camelCase property name; absent keys keep
	 * the inferred defaults.
	 */
	formFields?: Readonly<Record<string, FormFieldOverride>>;
}

export interface Resource<TEntity = unknown> {
	/** The entity class passed in. */
	readonly entity: new (
		...args: never[]
	) => TEntity;
	/** URL slug — e.g. "users", "blog-posts". Always lowercase, kebab-case. */
	readonly name: string;
	/** Display label — e.g. "Users". Defaults to a title-cased pluralised entity name. */
	readonly label: string;
	/** Frozen list of enabled actions, in canonical order (list, show, create, edit, destroy). */
	readonly actions: ReadonlyArray<ResourceAction>;
	/** Frozen policy table (Story 54.4). Empty object when not declared. */
	readonly policies: Readonly<Partial<Record<ResourceAction, PolicyFn>>>;
	/** Optional audit sink (Story 54.6). */
	readonly audit?: AuditSink;
	/** Frozen per-field overrides for the inferred form (Story 54.5). */
	readonly formFields: Readonly<Record<string, FormFieldOverride>>;
}
