import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

@Entity("residences")
export class Residence extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() name!: string;
	@Column() address!: string;
	@Column() city!: string;
	@Column() postalCode!: string;
	@Column({ nullable: true }) photo?: string;
	@Column() createdAt!: string;
	@Column() updatedAt!: string;
}
