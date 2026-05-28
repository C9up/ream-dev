import { BaseEntity, Column, Entity, PrimaryKey } from "@c9up/atlas";

export type UserRole =
	| "owner"
	| "tenant"
	| "cs_member"
	| "cs_president"
	| "syndic"
	| "bailleur";

@Entity("users")
export class User extends BaseEntity {
	@PrimaryKey() id!: string;
	@Column() email!: string;
	@Column() firstName!: string;
	@Column() lastName!: string;
	@Column({ nullable: true }) phone?: string;
	@Column({ nullable: true }) avatarUrl?: string;
	@Column() passwordHash!: string;
	@Column() createdAt!: string;
	@Column() updatedAt!: string;
}
