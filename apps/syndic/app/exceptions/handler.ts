import type { HttpContext } from "@c9up/ream";
import { ExceptionHandler } from "@c9up/ream";
import app from "@c9up/ream/services/app";

export default class HttpExceptionHandler extends ExceptionHandler {
	protected override debug = !app.inProduction;
	protected override ignoreStatuses = [400, 401, 404, 422];

	override async handle(error: unknown, ctx: HttpContext) {
		return super.handle(error, ctx);
	}

	override async report(error: unknown, ctx: HttpContext) {
		return super.report(error, ctx);
	}
}
