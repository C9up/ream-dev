import type { HttpContext } from "@c9up/ream";
import { inject } from "@c9up/ream";
import { requireParam, requireUser } from "../../../utils/http-guards.js";
import type { MessageChannel } from "../entities/Message.js";
import type { MessageService } from "../services/MessageService.js";

@inject()
export default class MessagesController {
	constructor(protected messageService: MessageService) {}

	async index({ request, response }: HttpContext) {
		const residenceId = requireParam(request, "residenceId", response);
		if (residenceId === null) return;
		const channel = request.input<string>("channel");
		const messages = this.messageService.listByResidence(
			residenceId,
			channel as MessageChannel | undefined,
		);
		response.json({ data: messages });
	}

	async store({ request, response, auth }: HttpContext) {
		const residenceId = requireParam(request, "residenceId", response);
		if (residenceId === null) return;
		const user = requireUser(auth, response);
		if (user === null) return;
		const body = request.all();
		const message = await this.messageService.send({
			residenceId,
			authorId: user.id,
			channel: (body.channel as MessageChannel) ?? "global",
			body: body.body as string,
			taskId: body.taskId as string | undefined,
			recipientId: body.recipientId as string | undefined,
			attachmentUrl: body.attachmentUrl as string | undefined,
		});
		response.status(201).json({ data: message });
	}
}
