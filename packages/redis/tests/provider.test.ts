import { beforeEach, describe, expect, it } from "vitest";
import type { ConnectionConfig, RedisConfig } from "../src/config.js";
import RedisProvider, { type RedisAppContext } from "../src/provider.js";
import { RedisManager } from "../src/RedisManager.js";
import redis, { clearRedis, getRedis } from "../src/services/main.js";

const config: RedisConfig<Record<string, ConnectionConfig>> = {
	connection: "main",
	connections: { main: { host: "127.0.0.1", port: 6379, lazyConnect: true } },
};

function appWith(
	stored: Record<string, unknown>,
): RedisAppContext & { bound: Map<unknown, unknown> } {
	const bound = new Map<unknown, unknown>();
	return {
		bound,
		container: {
			bindValue(token: unknown, value: unknown) {
				bound.set(token, value);
			},
			singleton(token: unknown, factory: () => unknown) {
				bound.set(token, factory());
			},
		},
		config: { get: <T>(key: string) => stored[key] as T | undefined },
	};
}

beforeEach(() => {
	const seated = getRedis();
	if (seated) clearRedis(seated);
});

describe("RedisProvider", () => {
	it("refuses to boot without config/redis.ts instead of dialling localhost", () => {
		const provider = new RedisProvider(appWith({}));
		expect(() => provider.register()).toThrow(/missing config\/redis\.ts/);
	});

	it('binds the manager as "redis" and seats the service accessor', () => {
		const app = appWith({ redis: config });
		new RedisProvider(app).register();

		expect(app.bound.get("redis")).toBeInstanceOf(RedisManager);
		expect(getRedis()).toBe(app.bound.get("redis"));
	});

	it("opens no socket at register — connections stay lazy", () => {
		const app = appWith({ redis: config });
		new RedisProvider(app).register();

		const manager = app.bound.get("redis");
		expect(manager).toBeInstanceOf(RedisManager);
		if (manager instanceof RedisManager)
			expect(manager.activeConnectionNames).toEqual([]);
	});

	it("releases the accessor on shutdown, so a second app is not torn down by the first", async () => {
		const provider = new RedisProvider(appWith({ redis: config }));
		provider.register();
		expect(getRedis()).toBeDefined();

		await provider.shutdown();
		expect(getRedis()).toBeUndefined();
	});
});

describe("services/main", () => {
	it("throws a named error when used before a provider seated it", () => {
		expect(() => redis.connection()).toThrow(/accessed before initialization/);
	});

	it("proxies through to the seated manager once there is one", () => {
		const manager = new RedisManager(config);
		new RedisProvider(appWith({ redis: config })).register();
		expect(redis.defaultConnectionName).toBe("main");
		manager.disconnect();
	});
});
