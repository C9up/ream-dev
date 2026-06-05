# Ream

**The Node.js framework that refuses to make you choose between productivity, performance, and flexibility.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

Most frameworks give you two of three: fast but bare-metal, productive but locked in, flexible but slow. Ream ships all three by running a Hyper-powered Rust HTTP core through NAPI while exposing a first-class TypeScript API with an IoC container, fluent router, ORM, validation, auth, and event bus — all wired together out of the box.

**~195,000 req/s.** Typed from request to response. Zero lock-in.

---

## Quick Start

```bash
npm init ream@latest
```

---

## What it looks like

```typescript
import { Ignitor } from '@c9up/ream'

new Ignitor({ port: 3000, serverFactory: createHyperServer })
  .httpServer()
  .use(async (ctx, next) => {
    ctx.response.header('x-powered-by', 'ream')
    await next()
  })
  .routes((router) => {
    router.group({ prefix: '/api/v1', guards: ['jwt'] }, (r) => {
      r.get('/orders', listOrders)
      r.post('/orders', createOrder).guard('jwt').validate('CreateOrderDTO')
    })
  })
  .start()
```

---

## The Framework Trilemma — resolved

| Concern | How Ream solves it |
|---|---|
| **Packaged** | IoC container, ORM, auth, validation, event bus, cache, queue, logging, realtime, and CLI included. |
| **Performant** | HTTP, DB, security, GraphQL parsing, and WebSocket all run in Rust via NAPI. TypeScript handles business logic only. |
| **Flexible** | Every component is swappable via the container. Override any binding in one line. |

---

## Architecture

```
RUST:  Hyper HTTP / WebSocket
       → Security filter (ammonia XSS, CSRF, rate limit)
       → GraphQL query validation
       → DB queries (sqlx — SQLite, PostgreSQL, MySQL)
           | NAPI crossing |
TS:    Logging → Global MW → Named MW → Guard → Validate
       → Transaction → Handler → After MW → Response
           | NAPI crossing |
RUST:  XSS response sanitization → Hyper sends response
```

---

## Ecosystem

| Package | Description |
|---|---|
| `@c9up/ream` | Core — Ignitor, IoC container, router, middleware, lifecycle, event bus (`@c9up/ream/events`), session, mail, hash, security |
| `@c9up/atlas` | ORM — entity decorators, QueryBuilder, migrations, transactions, soft deletes, relations (Rust DB driver) |
| `@c9up/rune` | Validation — fluent schema, nested objects, arrays, custom rules (Rust validation engine) |
| `@c9up/warden` | Auth — JWT, session, API key, OAuth2 (FirstContact), RBAC, token revocation, brute force protection |
| `@c9up/spectrum` | Logging — structured, file channels with rotation, correlation IDs |
| `@c9up/raytrace` | Realtime — SSE transport, Hub pattern for bidirectional WebSocket |
| `@c9up/echo` | Echo — Memory + Redis cache drivers, tags, stampede prevention |
| `@c9up/bay` | Bay — Background jobs, retry, dead letter queue, Memory + Redis drivers |
| `ream-cli` | CLI — project scaffolding, code generators, migrations, doctor (Rust binary) |

### Rust Crates

| Crate | Role |
|---|---|
| `ream-http` | Hyper HTTP server, WebSocket upgrade (RFC 6455) |
| `ream-security` | Ammonia XSS sanitizer, CSRF, rate limiting, Argon2/Bcrypt hashing, JWT HS256 |
| `ream-db` | Async database driver — SQLite, PostgreSQL, MySQL via sqlx |
| `ream-graphql` | GraphQL query parser (graphql-parser crate) |
| `ream-bus` | Event bus core — dispatch, routing, wildcards, correlation, retry |
| `ream-query` | SQL query compiler — identifier quoting, parameterization |
| `ream-napi-core` | Shared NAPI utilities — error handling, panic catching, shared Tokio runtime |

---

## What runs in Rust vs TypeScript

| Layer | Rust | TypeScript |
|---|---|---|
| HTTP server | Hyper (accept, parse, respond) | — |
| Security | XSS (ammonia), CSRF, rate limiting | Middleware chain |
| Database | Connection pool, query execution (sqlx) | ORM, entity mapping |
| GraphQL | Query parsing + validation | Resolver execution |
| Event bus | Dispatch, routing, wildcards | Listener classes, DI |
| Auth | JWT sign/verify, Argon2/Bcrypt hash | Strategy selection, guards |
| WebSocket | Upgrade handshake, frame management | Hub handlers |
| Validation | Type checking, string/number rules | Custom rules, transforms |

---

## Multi-Protocol API

Ream supports three API protocols under the same middleware/guard pipeline:

```typescript
// REST
router.post('/api/v1/tasks', [TasksController, 'store']).guard('jwt')

// JSON-RPC 2.0
rpc.method('task.create', [TasksController, 'store']).guard('jwt')

// GraphQL
engine.resolver('Mutation', 'createTask', TaskResolver, 'createTask', { guard: 'jwt' })
```

---

## Documentation

[C9up/v1-docs](https://github.com/C9up/v1-docs) — Full guides in English and French.

---

## Development

```bash
git clone --recursive git@github.com:C9up/ream-dev.git
cd ream-dev
./scripts/setup.sh
pnpm dev         # start demo app
pnpm test        # TypeScript test suites
pnpm test:rust   # Rust workspace tests
```

### Verifying the whole workspace

The day-to-day commands above only exercise a slice of the monorepo
(`pnpm test` runs vitest at the root, which does NOT touch most
package-local test suites or any Rust crate). Before committing
cross-cutting changes — submodule pointer bumps, NAPI surface edits,
shared-type refactors — run the single-button workspace gate:

```bash
pnpm verify:all
```

It runs eight stages, exits on the first failure, and tells you which
stage broke:

1. Node engine ≥ 22 (workspace `engines.node`)
2. `pnpm -r lint` (every package, `--if-present`)
3. `pnpm -r build` (every package, `--if-present`)
4. `pnpm -r typecheck` (every package, `--if-present`)
5. `pnpm -r test` (every package, `--if-present`)
6. `cargo check --all` (root Cargo workspace, 11 crates)
7. `cargo check` on the workspace-EXCLUDED crate
   (`packages/ream-cli`, not covered by `cargo check --all`)
8. `cargo test --all` (root Cargo workspace)

Read the header of `scripts/verify-all.sh` for the failure modes each
stage is designed to catch (the script exists specifically because
real cross-package breakage has slipped past the dev loop in the past).

---

## License

MIT
