import type { HttpContext } from "@c9up/ream";
import app from "@c9up/ream/services/app";
import { AuthManager } from "@c9up/warden";

export default class AuthMiddleware {
	async handle(ctx: HttpContext, next: () => Promise<void>) {
		const authHeader = ctx.request.header("authorization") ?? "";
		if (authHeader.startsWith("Bearer ")) {
			const token = authHeader.slice(7);
			const auth = app.container.resolve<AuthManager>(AuthManager);
			const result = await auth.verify(token);
			if (result.authenticated && result.user) {
				ctx.auth = {
					authenticated: true,
					user: result.user,
					roles: result.user.roles ?? [],
					permissions: result.user.permissions ?? [],
				};
			}
		}
		await next();
	}
}
