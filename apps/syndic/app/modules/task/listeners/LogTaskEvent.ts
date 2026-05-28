import { Inject, inject } from "@c9up/ream";
import type { Logger } from "@c9up/spectrum";
import type TaskDeclared from "../events/TaskDeclared.js";

@inject()
export default class LogTaskEvent {
	constructor(@Inject("logger") private logger: Logger) {}

	async handle(event: TaskDeclared) {
		this.logger
			.child({ module: "task" })
			.info(`Task ${event.taskId} declared in residence ${event.residenceId}`);
	}
}
