import router from "@c9up/ream/services/router";
import AuthController from "./controllers/AuthController.js";

router
	.group(() => {
		router.post("/register", [AuthController, "register"]).as("auth.register");
		router.post("/login", [AuthController, "login"]).as("auth.login");
	})
	.prefix("/api/auth");
