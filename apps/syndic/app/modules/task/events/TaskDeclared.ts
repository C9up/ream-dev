import { BaseEvent } from "@c9up/pulsar/events";

export default class TaskDeclared extends BaseEvent {
	constructor(
		public taskId: string,
		public residenceId: string,
		public declarantId: string,
	) {
		super();
	}
}
