import type { HttpContext } from "@c9up/ream";
import { inject } from "@c9up/ream";
import { requireParam, requireUser } from "../../../utils/http-guards.js";
import type { ResidenceService } from "../services/ResidenceService.js";

@inject()
export default class ResidencesController {
	constructor(protected residenceService: ResidenceService) {}

	async index({ response, auth }: HttpContext) {
		const user = requireUser(auth, response);
		if (user === null) return;
		const residences = this.residenceService.listForUser(user.id);
		response.json({ data: residences });
	}

	async store({ request, response }: HttpContext) {
		const residence = await this.residenceService.create(
			request.all() as {
				name: string;
				address: string;
				city: string;
				postalCode: string;
			},
		);
		response.status(201).json({ data: residence });
	}

	async show({ request, response }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const residence = this.residenceService.findById(id);
		if (!residence)
			return response.status(404).json({ error: "Residence not found" });
		response.json({ data: residence });
	}

	async buildings({ request, response }: HttpContext) {
		const residenceId = requireParam(request, "residenceId", response);
		if (residenceId === null) return;
		const buildings = this.residenceService.listBuildings(residenceId);
		response.json({ data: buildings });
	}
}
