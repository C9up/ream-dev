import type { HttpContext } from "@c9up/ream";
import { inject } from "@c9up/ream";
import type { AuthManager, JwtStrategy } from "@c9up/warden";
import { type UserService, UserServiceError } from "../services/UserService.js";

@inject()
export default class AuthController {
	constructor(
		protected userService: UserService,
		protected auth: AuthManager,
		protected jwt: JwtStrategy,
	) {}

	async register({ request, response }: HttpContext) {
		const { RegisterValidator } = await import(
			"../validators/RegisterValidator.js"
		);
		const result = RegisterValidator.validate(request.all());
		if (!result.valid) {
			return response.status(400).json({ errors: result.errors });
		}

		try {
			const user = await this.userService.register({
				email: result.data.email,
				password: result.data.password,
				firstName: result.data.firstName,
				lastName: result.data.lastName,
				phone: result.data.phone,
			});
			const token = this.jwt.signToken({ id: user.id, roles: [] });
			response.status(201).json({ user, token });
		} catch (err) {
			if (err instanceof UserServiceError && err.code === "EMAIL_TAKEN") {
				return response.status(409).json({ error: err.message });
			}
			throw err;
		}
	}

	async login({ request, response }: HttpContext) {
		const { LoginValidator } = await import(
			"../validators/RegisterValidator.js"
		);
		const result = LoginValidator.validate(request.all());
		if (!result.valid) {
			return response.status(400).json({ errors: result.errors });
		}

		const authResult = await this.auth.authenticate({
			email: result.data.email,
			password: result.data.password,
		});

		if (!authResult.authenticated || !authResult.user) {
			return response.status(401).json({ error: "Invalid credentials" });
		}

		const token = this.jwt.signToken(authResult.user);
		response.json({
			user: { id: authResult.user.id, email: authResult.user.email },
			token,
		});
	}
}
