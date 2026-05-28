import router from "@c9up/ream/services/router";
import ResidencesController from "./controllers/ResidencesController.js";

router
	.group(() => {
		router
			.get("/residences", [ResidencesController, "index"])
			.as("residences.index");
		router
			.post("/residences", [ResidencesController, "store"])
			.as("residences.store");
		router
			.get("/residences/:id", [ResidencesController, "show"])
			.as("residences.show");
		router
			.get("/residences/:residenceId/buildings", [
				ResidencesController,
				"buildings",
			])
			.as("residences.buildings");
	})
	.prefix("/api/v1")
	.guard("jwt");
