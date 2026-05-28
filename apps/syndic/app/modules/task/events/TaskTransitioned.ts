import { BaseEvent } from "@c9up/pulsar/events";
import type { TaskStatus } from "../entities/Task.js";

export default class TaskTransitioned extends BaseEvent {
	constructor(
		public taskId: string,
		public from: TaskStatus,
		public to: TaskStatus,
		public actorId: string,
	) {
		super();
	}
}
