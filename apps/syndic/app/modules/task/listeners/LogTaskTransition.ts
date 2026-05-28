import { Inject, inject } from "@c9up/ream";
import type { Logger } from "@c9up/spectrum";
import type TaskTransitioned from "../events/TaskTransitioned.js";

@inject()
export default class LogTaskTransition {
	constructor(@Inject("logger") private logger: Logger) {}

	async handle(event: TaskTransitioned) {
		this.logger
			.child({ module: "task" })
			.info(
				`Task ${event.taskId}: ${event.from} → ${event.to} by ${event.actorId}`,
			);
	}
}
