/**
 * Ream Demo — full stack: Ignitor + HyperServer + Router + Pipeline + Spectrum + Rune + Pulsar
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { arch, platform } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Ignitor } from '@c9up/ream'
import { Logger, ConsoleChannel } from '@c9up/spectrum'
import { rules, schema } from '@c9up/rune'
import { PulsarBus } from '@c9up/pulsar'

// --- Load HyperServer NAPI binary ---
const require2 = createRequire(import.meta.url)
const __dirname2 = dirname(fileURLToPath(import.meta.url))
const platformMap: Record<string, string> = {
  'linux-x64': 'linux-x64-gnu',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'win32-x64': 'win32-x64-msvc',
}
const suffix = platformMap[`${platform}-${arch}`]
if (!suffix) throw new Error(`Unsupported platform: ${platform}-${arch}`)
const httpNapi = require2(join(__dirname2, '../../packages/ream/tests/integration/http/index.' + suffix + '.node'))

// --- Services ---
const logger = new Logger({
  level: 'info',
  channels: [new ConsoleChannel('pretty')],
})

const bus = new PulsarBus()

const CreateUserSchema = schema({
  name: rules.string().min(2).max(100).trim(),
  email: rules.string().email(),
  age: rules.number().positive().optional(),
})

// --- Bus subscribers ---
bus.subscribe('user.*', (eventJson) => {
  const event = JSON.parse(eventJson)
  logger.child({ module: 'bus' }).info(`Event: ${event.name}`, { data: event.data })
})

// --- App (port auto-finds if 3000 is taken) ---
const app = new Ignitor({
  port: 3000,
  serverFactory: (p: number) => new httpNapi.HyperServer(p),
})
  .httpServer()

// Global middleware — logging
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  logger.info(`${ctx.request?.method} ${ctx.request?.path} ${ctx.response?.status ?? 200} — ${duration}ms`)
})

// Routes
app.routes((router) => {

  // Landing page
  router.get('/', async (ctx) => {
    ctx.response!.headers['content-type'] = 'text/html'
    ctx.response!.body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a; color: #fafafa;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .c { text-align: center; max-width: 640px; padding: 2rem; }
    h1 { font-size: 3.5rem; font-weight: 800; margin-bottom: 0.5rem; }
    h1 span { color: #f97316; }
    .tag { font-size: 1.2rem; color: #a1a1aa; margin-bottom: 2rem; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 2rem 0; }
    .card {
      background: #18181b; border: 1px solid #27272a; border-radius: 12px;
      padding: 1.25rem; text-align: left;
    }
    .card h3 { font-size: 0.9rem; color: #f97316; margin-bottom: 0.4rem; }
    .card p { font-size: 0.85rem; color: #a1a1aa; line-height: 1.4; }
    a { color: #f97316; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #27272a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
    .links { margin-top: 2rem; } .links a { margin: 0 1rem; font-size: 0.9rem; }
    .v { margin-top: 2rem; font-size: 0.75rem; color: #52525b; }
  </style>
</head>
<body>
  <div class="c">
    <h1><span>Ream</span></h1>
    <p class="tag">Rust-powered Node.js framework</p>
    <div class="cards">
      <div class="card"><h3>Rust Core</h3><p>HTTP server, event bus, security — compiled Rust via NAPI</p></div>
      <div class="card"><h3>TypeScript DX</h3><p>Decorators, IoC, fluent APIs — write TypeScript, run Rust</p></div>
      <div class="card"><h3>Modular</h3><p>Use the full framework or pick individual packages</p></div>
      <div class="card"><h3>Convention + Freedom</h3><p>Ignitor mode or toolkit mode — you choose</p></div>
    </div>
    <p style="color: #71717a; font-size: 0.85rem;">
      Try <code>GET /api/health</code> · <code>POST /api/users</code> · <code>GET /api/bus-test</code>
    </p>
    <div class="links">
      <a href="/api/health">Health</a>
      <a href="/api/bus-test">Bus Test</a>
      <a href="https://github.com/C9up/ream-dev">GitHub</a>
    </div>
    <p class="v">Ream v0.1.0 — Hyper + Pulsar + Spectrum + Rune</p>
  </div>
</body>
</html>`
  })

  // Health endpoint
  router.get('/api/health', async (ctx) => {
    ctx.response!.headers['content-type'] = 'application/json'
    ctx.response!.body = JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      stack: ['hyper', 'pulsar', 'spectrum', 'rune'],
    })
  })

  // Validation demo
  router.post('/api/users', async (ctx) => {
    const body = JSON.parse(ctx.request?.body ?? '{}')
    const result = CreateUserSchema.validate(body)

    if (!result.valid) {
      ctx.response!.status = 400
      ctx.response!.headers['content-type'] = 'application/json'
      ctx.response!.body = JSON.stringify({ errors: result.errors })
      return
    }

    // Emit event on bus
    bus.emit('user.created', JSON.stringify(result.data))

    ctx.response!.status = 201
    ctx.response!.headers['content-type'] = 'application/json'
    ctx.response!.body = JSON.stringify({
      user: { id: crypto.randomUUID(), ...result.data },
    })
  })

  // Bus test
  router.get('/api/bus-test', async (ctx) => {
    const eventJson = bus.emit('user.ping', JSON.stringify({ time: Date.now() }))
    const event = JSON.parse(eventJson)
    ctx.response!.headers['content-type'] = 'application/json'
    ctx.response!.body = JSON.stringify({
      message: 'Event emitted on Pulsar',
      event: { id: event.id, name: event.name, correlationId: event.correlationId },
    })
  })
})

await app.start()
const boundPort = await app.port()
logger.info(`Ream demo running on http://localhost:${boundPort}`)
logger.info('Stack: Hyper (Rust) + Pulsar (Rust) + Spectrum + Rune')
