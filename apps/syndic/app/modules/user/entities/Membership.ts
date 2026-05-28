import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";
import type { UserRole } from "./User.js";

@Entity("memberships")
export class Membership extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() userId!: string;
	@Column() residenceId!: string;
	@Column({ nullable: true }) unitId?: string;
	@Column() role!: UserRole;
	@Column() isActive!: boolean;
	@Column() joinedAt!: string;
	@Column({ nullable: true }) leftAt?: string;
}
