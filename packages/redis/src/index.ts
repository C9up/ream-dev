/**
 * `@c9up/redis` — Redis for the Ream framework.
 *
 * Owns the connection and nothing else: named connections, pub/sub on its own
 * socket, health checks, and a clean shutdown. The packages that store things
 * in Redis — @c9up/echo (cache), @c9up/bay (queue), @c9up/warden (token
 * blacklist) — keep taking a client by structural contract, so they stay
 * agnostic and this package stays optional.
 *
 *   // config/redis.ts
 *   export default defineConfig({
 *     connection: 'main',
 *     connections: { main: { url: env.get('REDIS_URL') } },
 *   })
 *
 *   // anywhere
 *   import redis from '@c9up/redis/services/main'
 *   await redis.connection().set('key', 'value')
 */

export type {
	ClusterConnectionConfig,
	ConnectionConfig,
	RedisClient,
	RedisConfig,
	StandaloneConnectionConfig,
} from "./config.js";
export { defineConfig, isClusterConfig } from "./config.js";
export type { HealthResult, HealthStatus } from "./health.js";
export { RedisCheck, RedisMemoryUsageCheck } from "./health.js";
export type { ChannelHandler, PatternHandler } from "./RedisConnection.js";
export { RedisConnection } from "./RedisConnection.js";
export { RedisManager } from "./RedisManager.js";
