import type { DatabaseConnection } from "@c9up/atlas";
import { BaseRepository } from "@c9up/atlas";
import { Inject, inject } from "@c9up/ream";
import type { MessageChannel } from "../entities/Message.js";
import { Message } from "../entities/Message.js";

@inject()
export class MessageService {
	private messages: BaseRepository<Message>;

	constructor(@Inject("db") db: DatabaseConnection) {
		this.messages = new BaseRepository(Message, db);
	}

	async send(data: {
		residenceId: string;
		authorId: string;
		channel: MessageChannel;
		body: string;
		taskId?: string;
		recipientId?: string;
		attachmentUrl?: string;
	}): Promise<Message> {
		const message = await this.messages.create({
			id: crypto.randomUUID(),
			residenceId: data.residenceId,
			authorId: data.authorId,
			channel: data.channel,
			taskId: data.taskId ?? null,
			recipientId: data.recipientId ?? null,
			body: data.body,
			attachmentUrl: data.attachmentUrl ?? null,
			createdAt: new Date().toISOString(),
		});
		return this.messages.findOrFail(message.id as string);
	}

	listByResidence(residenceId: string, channel?: MessageChannel): Message[] {
		const q = this.messages
			.query()
			.where("residence_id", residenceId)
			.orderBy("created_at", "desc")
			.limit(100);
		if (channel) q.where("channel", channel);
		return q.exec();
	}

	listByTask(taskId: string): Message[] {
		return this.messages
			.query()
			.where("task_id", taskId)
			.orderBy("created_at", "asc")
			.exec();
	}
}
