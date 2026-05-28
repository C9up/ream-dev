import router from "@c9up/ream/services/router";

router.get("/", async ({ response }) => {
	response.json({ name: "Syndic API", version: "0.1.0", status: "running" });
});
