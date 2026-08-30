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
| **Performant** | HTTP, DB, security, and GraphQL parsing all run in Rust via NAPI. TypeScript handles business logic only. |
| **Flexible** | Every component is swappable via the container. Override any binding in one line. |

---

## Architecture

```
RUST:  Hyper HTTP / SSE streaming
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

Every package is standalone and publishable on its own; they consume the Ream
universe through the container, never via a static import.

### Core

| Package | Description |
|---|---|
| `@c9up/ream` | Core — Ignitor, IoC container, router, middleware, lifecycle, event bus (`@c9up/ream/events`), session, scheduler, console kernel |
| `ream-cli` | CLI — project scaffolding, code generators, migrations, doctor (Rust binary) |
| `@c9up/ream-mcp` | MCP server — agent-ready framework assistant (docs, introspection, actions) |

### Data

| Package | Description |
|---|---|
| `@c9up/atlas` | ORM — entity decorators, QueryBuilder, migrations, transactions, soft deletes, relations (Rust DB driver) |
| `@c9up/eon` | Time-series data layer (TDengine-backed) |
| `@c9up/atom` | Exact decimal arithmetic (TypeScript + Rust N-API) |
| `@c9up/chronos` | Date/time and recurrence engine — RRULE (TypeScript + Rust N-API) |

### Security & auth

| Package | Description |
|---|---|
| `@c9up/warden` | Auth — JWT, session, API key, RBAC, token revocation, brute-force protection |
| `@c9up/transit` | Federated sign-in — SAML 2.0, LDAP, generic OpenID Connect, OAuth1 and OAuth2 |
| `@c9up/sigil` | Password hashing — argon2, bcrypt, scrypt |
| `@c9up/blackhole` | Rust-native security filter — XSS, CSRF, rate limiting (works with any Node.js framework) |
| `@c9up/rune` | Validation — fluent schema, nested objects, arrays, custom rules (Rust validation engine) |

### Frontend & protocols

| Package | Description |
|---|---|
| `@c9up/aurora` | Reactive UI runtime — tagged-template DOM, signals, isomorphic SSR + hydration, zero build step |
| `@c9up/photon` | Frontend rendering engine — SSR, client hydration, SPA navigation, SEO/`<head>` injection |
| `@c9up/inker` | Server-side templating — hand-rolled lexer/parser/renderer, HTML-escape by default |
| `@c9up/station` | Admin scaffolding — `defineResource` catalogue backing list/show/create/edit/destroy, audit, policies |
| `@c9up/comet` | Agnostic JSON-RPC 2.0 protocol + isomorphic, transport-injectable client |
| `@c9up/relay` | Realtime client transport — SSE. The WebSocket Hub and SignalR protocols are implemented but have no server-side transport yet (see `ream-http` below) |

### Infrastructure

| Package | Description |
|---|---|
| `@c9up/echo` | Cache — memory + Redis drivers, tags, stampede prevention |
| `@c9up/bay` | Background jobs — retry, lease, dead letter queue, memory + Redis drivers |
| `@c9up/quasar` | Redis connections — named connections, pub/sub on its own socket, health checks |
| `@c9up/archive` | File storage — Local + S3-compatible drivers |
| `@c9up/rover` | Mail transport — SMTP, log, pluggable transports |
| `@c9up/nova` | Web Push notifications — VAPID, subscription endpoint, service worker scaffolding |
| `@c9up/spectrum` | Logging — structured, file channels with rotation, correlation IDs |
| `@c9up/rosetta` | Internationalization — locale fallback, message formatting |

### Testing

| Package | Description |
|---|---|
| `@c9up/helix` | Framework-agnostic test runtime — Vitest-compatible runner, spies, container overrides, time-travel |
| `@c9up/helix-plugin-ream` | The ream↔helix bridge — boots a Ream app under test and injects a `TestClient` |

### Rust crates

Root Cargo workspace (`cargo check --all`):

| Crate | Role |
|---|---|
| `ream-http` / `ream-http-napi` | Hyper HTTP server core + NAPI bindings — request/response and SSE streaming. **No WebSocket upgrade point:** `websocket.rs` holds the handshake helpers but `server.rs` never calls them, and no `onUpgrade` is exposed over NAPI |
| `ream-events` / `ream-events-napi` | Event bus core — dispatch, routing, wildcards + NAPI bindings |
| `ream-scheduler` / `ream-scheduler-napi` | Cron parser + task ticker + NAPI bindings |
| `ream-graphql` | GraphQL query parser and validator |
| `ream-napi-core` | Shared NAPI utilities — error handling, panic catching, shared Tokio runtime |
| `ream-napi-test` | NAPI roundtrip test crate — validates Rust→NAPI→TS→NAPI→Rust |
| `atlas-db` | Async database driver — SQLite, PostgreSQL, MySQL via sqlx |
| `atlas-query` | SQL query compiler — identifier quoting, parameterization |

`ream-cli` is a standalone binary crate, deliberately excluded from the root
workspace. Every other Rust-backed package carries its own Cargo workspace under
`packages/<name>/crates/` — an engine crate plus its `-napi` binding: atom,
blackhole, chronos, eon, helix, inker, ream-mcp, rover, rune, sigil, warden.

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
| WebSocket | — (not wired) | Hub / SignalR protocol only — no transport to carry it |
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
