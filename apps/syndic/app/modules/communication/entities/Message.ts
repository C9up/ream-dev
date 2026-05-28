import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

export type MessageChannel = "global" | "task" | "private";

@Entity("messages")
export class Message extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() residenceId!: string;
	@Column() authorId!: string;
	@Column() channel!: MessageChannel;
	@Column({ nullable: true }) taskId?: string;
	@Column({ nullable: true }) recipientId?: string;
	@Column({ type: "text" }) body!: string;
	@Column({ nullable: true }) attachmentUrl?: string;
	@Column() createdAt!: string;
}
