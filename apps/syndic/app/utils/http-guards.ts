/**
 * Tiny guard helpers that turn the framework's nullable accessors
 * (`request.param`, `auth.user`) into typed values, with a 400/401
 * response side-effect when the precondition fails. Removes the need
 * for `request.param('id')!` / `auth.user!.id` non-null assertions in
 * controllers without bypassing TypeScript's strict-null-checks.
 *
 * Usage:
 *   const id = requireParam(request, 'id', response)
 *   if (id === null) return // 400 already sent
 *   const user = requireUser(auth, response)
 *   if (user === null) return // 401 already sent
 */
import type { HttpContext } from "@c9up/ream";

type Request = HttpContext["request"];
type Response = HttpContext["response"];
type Auth = HttpContext["auth"];

export function requireParam(
	request: Request,
	key: string,
	response: Response,
): string | null {
	const value = request.param(key);
	if (value === undefined) {
		response.status(400).json({ error: `Missing required path param: ${key}` });
		return null;
	}
	return value;
}

export function requireUser(
	auth: Auth,
	response: Response,
): NonNullable<Auth["user"]> | null {
	if (!auth.user) {
		response.status(401).json({ error: "Unauthenticated" });
		return null;
	}
	return auth.user;
}
