import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

@Entity("units")
export class Unit extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() buildingId!: string;
	@Column() number!: string;
	@Column({ nullable: true }) floor?: string;
	@Column({ type: "decimal", nullable: true }) tantiemes?: number;
	@Column() createdAt!: string;
}
