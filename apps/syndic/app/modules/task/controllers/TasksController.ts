import type { HttpContext } from "@c9up/ream";
import { inject } from "@c9up/ream";
import { requireParam, requireUser } from "../../../utils/http-guards.js";
import { type TaskService, TaskServiceError } from "../services/TaskService.js";

@inject()
export default class TasksController {
	constructor(protected taskService: TaskService) {}

	async index({ request, response }: HttpContext) {
		const residenceId = requireParam(request, "residenceId", response);
		if (residenceId === null) return;
		const tasks = this.taskService.listByResidence(residenceId);
		response.json({ data: tasks });
	}

	async store({ request, response, auth }: HttpContext) {
		const { CreateTaskValidator } = await import(
			"../validators/CreateTaskValidator.js"
		);
		const body = request.all();
		body.residenceId = request.param("residenceId");
		const result = CreateTaskValidator.validate(body);
		if (!result.valid) {
			return response.status(400).json({ errors: result.errors });
		}
		const user = requireUser(auth, response);
		if (user === null) return;

		try {
			const task = await this.taskService.create({
				...result.data,
				declarantId: user.id,
			});
			response.status(201).json({ data: task });
		} catch (err) {
			if (err instanceof TaskServiceError) {
				return response.status(422).json({ error: err.message });
			}
			throw err;
		}
	}

	async show({ request, response }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const task = this.taskService.findById(id);
		if (!task) return response.status(404).json({ error: "Task not found" });
		response.json({ data: task });
	}

	async timeline({ request, response }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const timeline = this.taskService.getTimeline(id);
		response.json({ data: timeline });
	}

	async validate({ request, response, auth }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const user = requireUser(auth, response);
		if (user === null) return;
		try {
			const task = await this.taskService.validate(id, user.id);
			response.json({ data: task });
		} catch (err) {
			if (err instanceof TaskServiceError) {
				return response
					.status(err.code === "NOT_FOUND" ? 404 : 422)
					.json({ error: err.message });
			}
			throw err;
		}
	}

	async assign({ request, response, auth }: HttpContext) {
		const syndicId = request.input<string>("syndicId");
		if (!syndicId)
			return response.status(400).json({ error: "syndicId is required" });
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const user = requireUser(auth, response);
		if (user === null) return;

		try {
			const task = await this.taskService.assign(id, syndicId, user.id);
			response.json({ data: task });
		} catch (err) {
			if (err instanceof TaskServiceError) {
				return response
					.status(err.code === "NOT_FOUND" ? 404 : 422)
					.json({ error: err.message });
			}
			throw err;
		}
	}

	async close({ request, response, auth }: HttpContext) {
		const id = requireParam(request, "id", response);
		if (id === null) return;
		const user = requireUser(auth, response);
		if (user === null) return;
		try {
			const task = await this.taskService.close(id, user.id);
			response.json({ data: task });
		} catch (err) {
			if (err instanceof TaskServiceError) {
				return response
					.status(err.code === "NOT_FOUND" ? 404 : 422)
					.json({ error: err.message });
			}
			throw err;
		}
	}
}
