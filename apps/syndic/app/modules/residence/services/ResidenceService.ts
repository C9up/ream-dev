import type { DatabaseConnection } from "@c9up/atlas";
import { BaseRepository } from "@c9up/atlas";
import { Inject, inject } from "@c9up/ream";
import { Building } from "../entities/Building.js";
import { Residence } from "../entities/Residence.js";

@inject()
export class ResidenceService {
	private residences: BaseRepository<Residence>;
	private buildings: BaseRepository<Building>;

	constructor(@Inject("db") db: DatabaseConnection) {
		this.residences = new BaseRepository(Residence, db);
		this.buildings = new BaseRepository(Building, db);
	}

	async create(data: {
		name: string;
		address: string;
		city: string;
		postalCode: string;
		photo?: string;
	}): Promise<Residence> {
		const now = new Date().toISOString();
		const residence = await this.residences.create({
			id: crypto.randomUUID(),
			name: data.name,
			address: data.address,
			city: data.city,
			postalCode: data.postalCode,
			photo: data.photo ?? null,
			createdAt: now,
			updatedAt: now,
		});
		return this.residences.findOrFail(residence.id as string);
	}

	findById(id: string): Residence | null {
		return this.residences.find(id);
	}

	list(): Residence[] {
		return this.residences.all();
	}

	listForUser(userId: string): Residence[] {
		// TODO(Epic 29.4): use ModelQuery joins once they are restored.
		// Until then, fall back to a raw join via QueryBuilder.
		return this.residences.raw(
			`SELECT residences.* FROM residences
       INNER JOIN memberships ON memberships.residence_id = residences.id
       WHERE memberships.user_id = ? AND memberships.is_active = 1
       ORDER BY residences.name ASC`,
			userId,
		);
	}

	async createBuilding(
		residenceId: string,
		data: { name: string; entranceCode?: string },
	): Promise<Building> {
		const building = await this.buildings.create({
			id: crypto.randomUUID(),
			residenceId,
			name: data.name,
			entranceCode: data.entranceCode ?? null,
			createdAt: new Date().toISOString(),
		});
		return this.buildings.findOrFail(building.id as string);
	}

	listBuildings(residenceId: string): Building[] {
		return this.buildings.where("residence_id", residenceId);
	}
}
