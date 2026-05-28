import type { HttpContext } from "@c9up/ream";
import app from "@c9up/ream/services/app";
import type { Logger } from "@c9up/spectrum";

export default class LogRequestMiddleware {
	async handle(ctx: HttpContext, next: () => Promise<void>) {
		const start = Date.now();
		await next();
		const duration = Date.now() - start;
		const logger = app.container.resolve<Logger>("logger");
		logger.info(
			`${ctx.request.method()} ${ctx.request.path()} ${ctx.response.getStatus()} — ${duration}ms`,
		);
	}
}
