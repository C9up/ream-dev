import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

export type QuoteStatus = "pending" | "approved" | "rejected";

@Entity("quotes")
export class Quote extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() taskId!: string;
	@Column() uploadedById!: string;
	@Column() providerName!: string;
	@Column({ type: "decimal" }) amount!: number;
	@Column({ nullable: true }) documentUrl?: string;
	@Column() status!: QuoteStatus;
	@Column() createdAt!: string;
}
