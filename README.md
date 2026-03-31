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
    ctx.response!.headers['x-powered-by'] = 'ream'
    await next()
  })
  .routes((router) => {
    router.group({ prefix: '/api/v1', middleware: ['auth'] }, (r) => {
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
| **Packaged** | IoC container, ORM, auth, validation, event bus, logging, and CLI included. |
| **Performant** | HTTP handled by Hyper (Rust) over NAPI. Security runs in Rust before the request crosses into TypeScript. |
| **Flexible** | Every component is swappable via the container. Override any binding in one line. |

---

## Architecture

```
RUST:  Rate limit  ->  XSS/CSRF reject
        | NAPI crossing |
TS:    Logging  ->  Global MW  ->  Named MW  ->  Guard  ->  Validate
       ->  Transaction  ->  Handler  ->  After MW  ->  Response log
        | NAPI crossing |
RUST:  Hyper sends response
```

---

## Ecosystem

| Package | Description | Repo |
|---|---|---|
| `@c9up/ream` | Core — Ignitor, IoC container, router, middleware, lifecycle | [C9up/ream](https://github.com/C9up/ream) |
| `@c9up/pulsar` | Event bus — emit, subscribe, wildcards, request-reply | [C9up/pulsar](https://github.com/C9up/pulsar) |
| `@c9up/atlas` | ORM — entity decorators, QueryBuilder, domain events | [C9up/atlas](https://github.com/C9up/atlas) |
| `@c9up/rune` | Validation — fluent schema rules, custom validators | [C9up/rune](https://github.com/C9up/rune) |
| `@c9up/warden` | Auth — multi-strategy, RBAC, @Guard / @Role decorators | [C9up/warden](https://github.com/C9up/warden) |
| `@c9up/spectrum` | Logging — structured, channels, correlation IDs | [C9up/spectrum](https://github.com/C9up/spectrum) |
| `@c9up/forge` | CLI — code generators, doctor, inspector | [C9up/forge](https://github.com/C9up/forge) |
| `create-ream` | Project scaffolder | [C9up/create-ream](https://github.com/C9up/create-ream) |

---

## Documentation

[C9up/v1-docs](https://github.com/C9up/v1-docs) — Full guides in English and French.

---

## Development

```bash
git clone --recursive git@github.com:C9up/ream-dev.git
cd ream-dev
./scripts/setup.sh
pnpm dev    # start demo app
pnpm test   # 317 TypeScript tests
pnpm test:rust  # 89 Rust tests
```

---

## License

MIT
