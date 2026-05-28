/**
 * Ream Framework — Benchmark Suite
 *
 * Measures (per @implements story 15.8):
 *   - Router match time (static O(1) + parametric)
 *   - Middleware pipeline overhead per request
 *   - NAPI roundtrip latency (HttpKernel boundary)
 *   - Container resolution
 *
 * Captures all measurements to `benchmarks/results.json`. The previous run
 * (if present) is loaded for regression comparison; any operation that
 * regresses by more than 10 % vs the baseline is flagged ⚠️ and the process
 * exits with code 1 so CI can warn.
 *
 * Run: npx tsx benchmarks/bench.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface BenchResult {
  name: string
  opsPerSec: number
  nsPerOp: number
}

const REGRESSION_THRESHOLD = 0.10 // 10 %
const RESULTS_FILE = join('benchmarks', 'results.json')

const results: BenchResult[] = []

function bench(name: string, fn: () => void | Promise<void>, iterations = 100_000): void {
  for (let i = 0; i < 1000; i++) fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const elapsed = performance.now() - start
  const opsPerSec = Math.round(iterations / (elapsed / 1000))
  const nsPerOp = Math.round((elapsed / iterations) * 1_000_000)
  results.push({ name, opsPerSec, nsPerOp })
  console.log(`${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(12)} ops/s  ${nsPerOp.toLocaleString().padStart(8)} ns/op`)
}

async function benchAsync(name: string, fn: () => Promise<unknown>, iterations = 10_000): Promise<void> {
  for (let i = 0; i < 100; i++) await fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) await fn()
  const elapsed = performance.now() - start
  const opsPerSec = Math.round(iterations / (elapsed / 1000))
  const nsPerOp = Math.round((elapsed / iterations) * 1_000_000)
  results.push({ name, opsPerSec, nsPerOp })
  console.log(`${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(12)} ops/s  ${nsPerOp.toLocaleString().padStart(8)} ns/op`)
}

async function main() {
  console.log('Ream Benchmark Suite')
  console.log('='.repeat(80))

  // ─── Router ──────────────────────────────────────────────────────────
  const { Router } = await import('../packages/ream/src/router/Router.js')
  const router = new Router()
  for (let i = 0; i < 10; i++) {
    router.get(`/api/v1/resource${i}`, async () => {})
    router.post(`/api/v1/resource${i}`, async () => {})
    router.get(`/api/v1/resource${i}/:id`, async () => {})
    router.put(`/api/v1/resource${i}/:id`, async () => {})
    router.delete(`/api/v1/resource${i}/:id`, async () => {})
  }

  console.log('\nRouter (50 routes)')
  bench('  router/static-first', () => router.match('GET', '/api/v1/resource0'))
  bench('  router/static-last', () => router.match('GET', '/api/v1/resource9'))
  bench('  router/param', () => router.match('GET', '/api/v1/resource5/123'))
  bench('  router/no-match', () => router.match('GET', '/nonexistent'))

  // ─── Container ───────────────────────────────────────────────────────
  const { Container } = await import('../packages/ream/src/container/Container.js')
  const container = new Container()
  container.singleton('config', () => ({ db: 'sqlite' }))
  console.log('\nContainer')
  bench('  container/singleton', () => container.make('config'))

  // ─── Middleware pipeline ─────────────────────────────────────────────
  const { MiddlewareRegistry } = await import('../packages/ream/src/middleware/Pipeline.js')
  const pipeline = new MiddlewareRegistry()
  pipeline.use(async (_ctx, next) => { await next() })
  pipeline.use(async (_ctx, next) => { await next() })
  pipeline.use(async (_ctx, next) => { await next() })
  const handler = async () => {}
  const chain = pipeline.buildChain([], [], handler)

  // Mock minimal HttpContext shape
  const mockCtx = { id: 'bench', request: {}, response: {}, auth: {} } as unknown as Parameters<typeof chain>[0]

  console.log('\nMiddleware pipeline (3 global + handler)')
  await benchAsync('  pipeline/exec', () => chain(mockCtx, async () => {}))

  // ─── HttpKernel NAPI roundtrip ───────────────────────────────────────
  const { createHttpKernel } = await import('../packages/ream/src/HttpKernel.js')
  const kernelRouter = new Router()
  kernelRouter.get('/health', async (ctx) => { ctx.response.json({ ok: true }) })
  const kernel = createHttpKernel({ router: kernelRouter, middleware: pipeline })
  const reqObj = { method: 'GET', path: '/health', query: '', headers: {}, body: '' }

  console.log('\nHttpKernel boundary (typed object, no JSON serialization)')
  await benchAsync('  kernel/hello-world', () => kernel(reqObj), 5000)

  // ─── Results ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80))

  const payload = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
  }

  // Compare against the previous run (regression detection).
  let hasRegression = false
  if (existsSync(RESULTS_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(RESULTS_FILE, 'utf8')) as { results?: BenchResult[] }
      const baseline = new Map(prev.results?.map((r) => [r.name, r]) ?? [])
      console.log('\nRegression check (vs previous run):')
      for (const r of results) {
        const old = baseline.get(r.name)
        if (!old) continue
        const delta = (r.opsPerSec - old.opsPerSec) / old.opsPerSec
        const arrow = delta >= 0 ? '▲' : '▼'
        const flag = delta < -REGRESSION_THRESHOLD ? '  ⚠️ REGRESSION' : ''
        if (delta < -REGRESSION_THRESHOLD) hasRegression = true
        console.log(`  ${r.name.padEnd(45)} ${arrow} ${(delta * 100).toFixed(1).padStart(6)}%${flag}`)
      }
    } catch {
      console.log('(Previous results.json unreadable — skipping regression check)')
    }
  }

  writeFileSync(RESULTS_FILE, JSON.stringify(payload, null, 2))
  console.log(`\nResults written to ${RESULTS_FILE}`)

  if (hasRegression) {
    console.error(`\n❌ One or more benchmarks regressed by more than ${REGRESSION_THRESHOLD * 100}%`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
