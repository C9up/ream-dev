/**
 * Wires `config/redis.ts` into the container as `'redis'`, and seats the
 * manager on `@c9up/redis/services/main`.
 *
 * The host is duck-typed — this package stays publishable without importing
 * `@c9up/ream`. Any framework exposing a container plus a config store
 * satisfies it.
 *
 * The manager is built in `register` (opening nothing: connections are lazy),
 * so anything reaching for `'redis'` during another provider's `boot` — a JWT
 * blacklist, a cache store — finds it already seated.
 */

import type { ConnectionConfig, RedisConfig } from "./config.js";
import { RedisManager } from "./RedisManager.js";
import { clearRedis, setRedis } from "./services/main.js";

interface RedisContainer {
	bindValue?(token: unknown, value: unknown): void;
	singleton(token: unknown, factory: () => unknown): void;
}
interface RedisConfigStore {
	get<T = unknown>(key: string): T | undefined;
}
export interface RedisAppContext {
	container: RedisContainer;
	config: RedisConfigStore;
}

type AnyConfig = RedisConfig<Record<string, ConnectionConfig>>;

export default class RedisProvider {
	readonly #app: RedisAppContext;
	#manager: RedisManager<Record<string, ConnectionConfig>> | undefined;

	constructor(app: RedisAppContext) {
		this.#app = app;
	}

	register(): void {
		const config = this.#app.config.get<AnyConfig>("redis");
		if (config === undefined) {
			throw new Error("[redis] missing config/redis.ts");
		}

		const manager = new RedisManager(config);
		this.#manager = manager;
		setRedis(manager);

		if (this.#app.container.bindValue) {
			this.#app.container.bindValue("redis", manager);
		} else {
			this.#app.container.singleton("redis", () => manager);
		}
	}

	/**
	 * QUIT every open connection. Without this a stopped process keeps its
	 * sockets, and ioredis' reconnection timer keeps the event loop alive — the
	 * server looks hung instead of exiting.
	 */
	async shutdown(): Promise<void> {
		const manager = this.#manager;
		if (!manager) return;
		await manager.quit();
		clearRedis(manager);
		this.#manager = undefined;
	}
}
