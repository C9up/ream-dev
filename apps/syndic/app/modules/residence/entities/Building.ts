import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

@Entity("buildings")
export class Building extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() residenceId!: string;
	@Column() name!: string;
	@Column({ nullable: true }) entranceCode?: string;
	@Column() createdAt!: string;
}
