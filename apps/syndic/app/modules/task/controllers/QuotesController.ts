import type { HttpContext } from "@c9up/ream";
import { inject } from "@c9up/ream";
import { requireParam, requireUser } from "../../../utils/http-guards.js";
import type { QuoteService } from "../services/QuoteService.js";

@inject()
export default class QuotesController {
	constructor(protected quoteService: QuoteService) {}

	async index({ request, response }: HttpContext) {
		const taskId = requireParam(request, "taskId", response);
		if (taskId === null) return;
		const quotes = this.quoteService.listByTask(taskId);
		response.json({ data: quotes });
	}

	async store({ request, response, auth }: HttpContext) {
		const taskId = requireParam(request, "taskId", response);
		if (taskId === null) return;
		const user = requireUser(auth, response);
		if (user === null) return;
		const body = request.all();
		const quote = await this.quoteService.create({
			taskId,
			uploadedById: user.id,
			providerName: body.providerName as string,
			amount: body.amount as number,
			documentUrl: body.documentUrl as string | undefined,
		});
		response.status(201).json({ data: quote });
	}

	async approve({ request, response }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const quote = this.quoteService.approve(id);
		response.json({ data: quote });
	}
}
