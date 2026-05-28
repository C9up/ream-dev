import type { DatabaseConnection } from "@c9up/atlas";
import { BaseRepository } from "@c9up/atlas";
import { Inject, inject } from "@c9up/ream";
import type { TaskStatus } from "../entities/Task.js";
import { Task } from "../entities/Task.js";
import { TaskEvent } from "../entities/TaskEvent.js";
import TaskDeclared from "../events/TaskDeclared.js";
import TaskTransitioned from "../events/TaskTransitioned.js";

const TRANSITIONS: Record<string, TaskStatus[]> = {
	declared: ["validated", "rejected"],
	validated: ["assigned", "rejected"],
	assigned: ["quoting", "in_progress", "rejected"],
	quoting: ["quote_approved", "assigned"],
	quote_approved: ["scheduled", "in_progress"],
	scheduled: ["in_progress"],
	in_progress: ["completed"],
	completed: ["closed"],
	closed: [],
	rejected: [],
};

@inject()
export class TaskService {
	private tasks: BaseRepository<Task>;
	private taskEvents: BaseRepository<TaskEvent>;

	constructor(@Inject("db") db: DatabaseConnection) {
		this.tasks = new BaseRepository(Task, db);
		this.taskEvents = new BaseRepository(TaskEvent, db);
	}

	async create(data: {
		residenceId: string;
		declarantId: string;
		title: string;
		description: string;
		visibility: string;
		urgency: string;
		buildingId?: string;
		unitId?: string;
		category?: string;
	}): Promise<Task> {
		const now = new Date().toISOString();
		const task = await this.tasks.create({
			id: crypto.randomUUID(),
			residenceId: data.residenceId,
			buildingId: data.buildingId ?? null,
			unitId: data.unitId ?? null,
			declarantId: data.declarantId,
			title: data.title,
			description: data.description,
			status: "declared",
			visibility: data.visibility,
			urgency: data.urgency,
			category: data.category ?? null,
			createdAt: now,
			updatedAt: now,
		});

		const taskId = task.id as string;
		await this.recordEvent(taskId, data.declarantId, "declared");
		await new TaskDeclared(taskId, data.residenceId, data.declarantId).emit();

		return this.tasks.findOrFail(taskId);
	}

	findById(id: string): Task | null {
		return this.tasks.find(id);
	}

	listByResidence(residenceId: string): Task[] {
		return this.tasks.where("residence_id", residenceId);
	}

	async transition(
		taskId: string,
		newStatus: TaskStatus,
		actorId: string,
		comment?: string,
	): Promise<Task> {
		const task = this.tasks.findOrFail(taskId);

		const previousStatus = task.status;
		const allowed = TRANSITIONS[previousStatus];
		if (!allowed?.includes(newStatus)) {
			throw new TaskServiceError(
				"INVALID_TRANSITION",
				`Cannot transition from '${previousStatus}' to '${newStatus}'`,
			);
		}

		task.status = newStatus;
		task.updatedAt = new Date().toISOString();
		if (newStatus === "closed") {
			task.closedAt = new Date().toISOString();
		}

		this.tasks.updateById(taskId, {
			status: task.status,
			updatedAt: task.updatedAt,
			closedAt: task.closedAt ?? null,
		});

		await this.recordEvent(taskId, actorId, newStatus, null, comment);
		await new TaskTransitioned(
			taskId,
			previousStatus,
			newStatus,
			actorId,
		).emit();

		return this.tasks.findOrFail(taskId);
	}

	async validate(taskId: string, actorId: string): Promise<Task> {
		return this.transition(taskId, "validated", actorId);
	}

	async assign(
		taskId: string,
		syndicId: string,
		actorId: string,
	): Promise<Task> {
		await this.transition(taskId, "assigned", actorId);
		this.tasks.updateById(taskId, { assignedSyndicId: syndicId });
		return this.tasks.findOrFail(taskId);
	}

	async close(taskId: string, actorId: string): Promise<Task> {
		return this.transition(taskId, "closed", actorId);
	}

	getTimeline(taskId: string): TaskEvent[] {
		return this.taskEvents.where("task_id", taskId);
	}

	private async recordEvent(
		taskId: string,
		actorId: string,
		eventType: string,
		data?: string | null,
		comment?: string | null,
	): Promise<void> {
		await this.taskEvents.create({
			id: crypto.randomUUID(),
			taskId,
			actorId,
			eventType,
			data: data ?? null,
			comment: comment ?? null,
			createdAt: new Date().toISOString(),
		});
	}
}

export class TaskServiceError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "TaskServiceError";
		this.code = code;
	}
}
