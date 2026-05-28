import type { SafeString } from "./SafeString.js";

/**
 * Signature for the canonical `t(key, params?)` helper.
 *
 * Inker ships ZERO body for this helper — implementations come from
 * the caller via `TemplatesOptions.helpers`. The Ream provider (Story
 * 53.5) wires this signature to `@c9up/rosetta`'s `Rosetta#t(key,
 * params?, options?)`.
 */
export type THelper = (key: string, params?: Record<string, unknown>) => string;

/**
 * Signature for the canonical `csrfField()` helper.
 *
 * Returns a `SafeString` containing the `<input type="hidden"
 * name="_csrf" value="…">` element. Returning a `SafeString` is
 * mandatory — a plain string would be HTML-escaped by the renderer
 * and the resulting `&lt;input …&gt;` would not be a usable form
 * field. Implementation is provided by the Ream provider (Story 53.5)
 * wiring the session's CSRF token.
 */
export type CsrfFieldHelper = () => SafeString;

/**
 * Signature for the canonical `url(name, params?)` helper.
 *
 * Resolves a named route + interpolates path params. Implementation
 * is provided by the Ream provider (Story 53.5) wiring the router.
 */
export type UrlHelper = (
	name: string,
	params?: Record<string, unknown>,
) => string;

/**
 * Signature for the canonical `asset(name)` helper.
 *
 * Resolves an asset manifest entry to its hashed public URL.
 * Implementation is provided by the Ream provider (Story 53.5) wiring
 * the asset manifest.
 */
export type AssetHelper = (name: string) => string;
