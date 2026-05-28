import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

export type TaskStatus =
	| "declared"
	| "validated"
	| "assigned"
	| "quoting"
	| "quote_approved"
	| "scheduled"
	| "in_progress"
	| "completed"
	| "closed"
	| "rejected";
export type TaskVisibility =
	| "public"
	| "owners_only"
	| "cs_syndic_only"
	| "private";
export type TaskUrgency = "low" | "medium" | "high" | "emergency";

@Entity("tasks")
export class Task extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() residenceId!: string;
	@Column({ nullable: true }) buildingId?: string;
	@Column({ nullable: true }) unitId?: string;
	@Column() declarantId!: string;
	@Column() title!: string;
	@Column({ type: "text" }) description!: string;
	@Column() status!: TaskStatus;
	@Column() visibility!: TaskVisibility;
	@Column() urgency!: TaskUrgency;
	@Column({ nullable: true }) assignedSyndicId?: string;
	@Column({ nullable: true }) category?: string;
	@Column() createdAt!: string;
	@Column() updatedAt!: string;
	@Column({ nullable: true }) closedAt?: string;

	declare() {
		this.status = "declared";
		this.addDomainEvent("task.declared", {
			taskId: this.id,
			residenceId: this.residenceId,
		});
	}

	validate(validatorId: string) {
		this.status = "validated";
		this.addDomainEvent("task.validated", { taskId: this.id, validatorId });
	}

	assign(syndicId: string) {
		this.assignedSyndicId = syndicId;
		this.status = "assigned";
		this.addDomainEvent("task.assigned", { taskId: this.id, syndicId });
	}

	close(closerId: string) {
		this.status = "closed";
		this.closedAt = new Date().toISOString();
		this.addDomainEvent("task.closed", { taskId: this.id, closerId });
	}
}
