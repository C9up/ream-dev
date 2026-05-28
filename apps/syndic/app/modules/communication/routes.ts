import router from "@c9up/ream/services/router";
import MessagesController from "./controllers/MessagesController.js";

router
	.group(() => {
		router
			.get("/residences/:residenceId/messages", [MessagesController, "index"])
			.as("messages.index");
		router
			.post("/residences/:residenceId/messages", [MessagesController, "store"])
			.as("messages.store");
	})
	.prefix("/api/v1")
	.guard("jwt");
