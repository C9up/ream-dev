import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

@Entity("task_events")
export class TaskEvent extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() taskId!: string;
	@Column() actorId!: string;
	@Column() eventType!: string;
	@Column({ nullable: true }) data?: string;
	@Column({ nullable: true }) comment?: string;
	@Column() createdAt!: string;
}
