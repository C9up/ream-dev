import type { DatabaseConnection } from "@c9up/atlas";
import { BaseRepository } from "@c9up/atlas";
import { Inject, inject } from "@c9up/ream";
import { Quote } from "../entities/Quote.js";

@inject()
export class QuoteService {
	private quotes: BaseRepository<Quote>;

	constructor(@Inject("db") db: DatabaseConnection) {
		this.quotes = new BaseRepository(Quote, db);
	}

	async create(data: {
		taskId: string;
		uploadedById: string;
		providerName: string;
		amount: number;
		documentUrl?: string;
	}): Promise<Quote> {
		const quote = await this.quotes.create({
			id: crypto.randomUUID(),
			taskId: data.taskId,
			uploadedById: data.uploadedById,
			providerName: data.providerName,
			amount: data.amount,
			status: "pending",
			documentUrl: data.documentUrl ?? null,
			createdAt: new Date().toISOString(),
		});
		return this.quotes.findOrFail(quote.id as string);
	}

	listByTask(taskId: string): Quote[] {
		return this.quotes.where("task_id", taskId);
	}

	approve(quoteId: string): Quote {
		const quote = this.quotes.findOrFail(quoteId);
		// Reject all other quotes for the same task
		const others = this.quotes.query().where("task_id", quote.taskId).exec();
		for (const other of others) {
			if (other.id !== quoteId) {
				this.quotes.updateById(other.id, { status: "rejected" });
			}
		}
		this.quotes.updateById(quoteId, { status: "approved" });
		return this.quotes.findOrFail(quoteId);
	}
}
