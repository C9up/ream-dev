import router from "@c9up/ream/services/router";
import QuotesController from "./controllers/QuotesController.js";
import TasksController from "./controllers/TasksController.js";

router
	.group(() => {
		// Tasks nested under residences
		router
			.get("/residences/:residenceId/tasks", [TasksController, "index"])
			.as("tasks.index");
		router
			.post("/residences/:residenceId/tasks", [TasksController, "store"])
			.as("tasks.store");

		// Task detail + timeline
		router.get("/tasks/:id", [TasksController, "show"]).as("tasks.show");
		router
			.get("/tasks/:id/timeline", [TasksController, "timeline"])
			.as("tasks.timeline");

		// Task actions (CS/Syndic)
		router
			.post("/tasks/:id/validate", [TasksController, "validate"])
			.as("tasks.validate")
			.role("cs_member", "cs_president");
		router
			.post("/tasks/:id/assign", [TasksController, "assign"])
			.as("tasks.assign")
			.role("cs_member", "cs_president");
		router
			.post("/tasks/:id/close", [TasksController, "close"])
			.as("tasks.close")
			.role("cs_member", "cs_president");

		// Quotes
		router
			.get("/tasks/:taskId/quotes", [QuotesController, "index"])
			.as("quotes.index");
		router
			.post("/tasks/:taskId/quotes", [QuotesController, "store"])
			.as("quotes.store")
			.role("syndic");
		router
			.post("/quotes/:id/approve", [QuotesController, "approve"])
			.as("quotes.approve")
			.role("cs_member", "cs_president");
	})
	.prefix("/api/v1")
	.guard("jwt");
