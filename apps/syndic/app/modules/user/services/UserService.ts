import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseConnection } from "@c9up/atlas";
import { BaseRepository } from "@c9up/atlas";
import { Inject, inject } from "@c9up/ream";
import type { UserPayload } from "@c9up/warden";
import { Membership } from "../entities/Membership.js";
import { User } from "../entities/User.js";

const scryptAsync = promisify(scrypt);
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

@inject()
export class UserService {
	private users: BaseRepository<User>;
	private memberships: BaseRepository<Membership>;

	constructor(@Inject("db") db: DatabaseConnection) {
		this.users = new BaseRepository(User, db);
		this.memberships = new BaseRepository(Membership, db);
	}

	async hashPassword(password: string): Promise<string> {
		const salt = randomBytes(SALT_LENGTH);
		const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
		return `${salt.toString("hex")}:${derived.toString("hex")}`;
	}

	async verifyPassword(password: string, hash: string): Promise<boolean> {
		const [saltHex, keyHex] = hash.split(":");
		if (!saltHex || !keyHex) return false;
		const salt = Buffer.from(saltHex, "hex");
		const storedKey = Buffer.from(keyHex, "hex");
		const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
		if (derived.length !== storedKey.length) return false;
		return timingSafeEqual(derived, storedKey);
	}

	async register(data: {
		email: string;
		password: string;
		firstName: string;
		lastName: string;
		phone?: string;
	}): Promise<{
		id: string;
		email: string;
		firstName: string;
		lastName: string;
	}> {
		const existing = await this.users.findBy("email", data.email);
		if (existing) {
			throw new UserServiceError(
				"EMAIL_TAKEN",
				`Email '${data.email}' is already registered`,
			);
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const passwordHash = await this.hashPassword(data.password);

		await this.users.create({
			id,
			email: data.email,
			firstName: data.firstName,
			lastName: data.lastName,
			phone: data.phone ?? null,
			passwordHash,
			createdAt: now,
			updatedAt: now,
		});

		return {
			id,
			email: data.email,
			firstName: data.firstName,
			lastName: data.lastName,
		};
	}

	async verifyCredentials(
		email: string,
		password: string,
	): Promise<UserPayload | null> {
		const user = this.users.findBy("email", email);
		if (!user) return null;

		const valid = await this.verifyPassword(password, user.passwordHash);
		if (!valid) return null;

		const memberships = this.memberships.where("user_id", user.id);
		const roles = [...new Set(memberships.map((m) => m.role))];

		return { id: user.id, email: user.email, roles };
	}

	async findById(id: string): Promise<UserPayload | null> {
		const user = this.users.find(id);
		if (!user) return null;

		const memberships = this.memberships.where("user_id", user.id);
		const roles = [...new Set(memberships.map((m) => m.role))];

		return { id: user.id, email: user.email, roles };
	}
}

export class UserServiceError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "UserServiceError";
		this.code = code;
	}
}
