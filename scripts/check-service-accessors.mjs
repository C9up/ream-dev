#!/usr/bin/env node
/**
 * Refuse a service accessor that a stopped application keeps alive.
 *
 * Every package exposing `services/main` holds its instance in a module-level
 * cell. A provider that does not release it leaves a torn-down manager
 * reachable from anywhere in the process — and with two applications in one
 * process (parallel tests, a hot reload), whichever booted last silently owns
 * the cell for both. For warden that means guards authenticating against an
 * application that no longer exists.
 *
 * Eleven of sixteen packages were missing it, and they were missing it because
 * the accessor is COPIED between packages rather than shared: each copy drifts
 * on its own. Sharing the code is not on the table — every package here is
 * publishable and depends on no sibling — so the consistency is enforced here
 * instead. The duplication stays; the divergence does not.
 *
 * Exits non-zero and names every offender, so one run fixes the whole set.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')

/**
 * Packages whose accessor deliberately outlives shutdown.
 *
 * An entry is a claim with a reason, checkable against the code it names —
 * not a way to quiet the gate.
 */
const DELIBERATE = {
  inker:
    'InkerProvider.shutdown() documents it: the renderer outlives shutdown so a ' +
    'late-arriving handler does not meet a torn-down proxy mid-render.',
}

/** Every `<pkg>/src/services/main.ts` in the workspace. */
function accessors() {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((pkg) => ({ pkg, file: join(packagesDir, pkg, 'src/services/main.ts') }))
    .filter((candidate) => existsSync(candidate.file))
}

/** The provider files a package might wire its shutdown from. */
function providerSources(pkg) {
  const dir = join(packagesDir, pkg, 'src')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /rovider.*\.ts$/.test(entry.name))
    .map((entry) => readFileSync(join(dir, entry.name), 'utf8'))
}

const problems = []

for (const { pkg, file } of accessors()) {
  // A documented exception is checked before anything else: the claim is that
  // this accessor SHOULD outlive shutdown, so the absence of a clear* is the
  // point rather than the fault.
  if (DELIBERATE[pkg]) continue

  const source = readFileSync(file, 'utf8')
  const clear = /export function (clear[A-Za-z0-9]*)\s*\(([^)]*)\)/.exec(source)

  if (!clear) {
    problems.push(
      `${pkg}: src/services/main.ts exports no clear* — a stopped application leaves its singleton reachable.`,
    )
    continue
  }
  const [, clearName, clearParams] = clear
  // Two shapes are correct. Either the clear takes the instance and compares it
  // itself (quasar), or it takes nothing and the CALLER compares first. What is
  // wrong is clearing unconditionally: with two applications in one process,
  // the one shutting down would take the survivor's binding with it.
  const guardsItself = clearParams.trim().length > 0
  const getter = clearName.replace(/^clear/, 'get')

  const providers = providerSources(pkg)
  if (providers.length === 0) {
    problems.push(`${pkg}: exports ${clearName}() but has no provider to call it.`)
    continue
  }
  const wired = providers.some((provider) => {
    if (!provider.includes(`${clearName}(`)) return false
    return guardsItself || provider.includes(`${getter}() ===`)
  })
  if (!wired) {
    problems.push(
      guardsItself
        ? `${pkg}: no provider calls ${clearName}() on shutdown.`
        : `${pkg}: no provider calls ${clearName}() guarded by \`${getter}() === …\` on shutdown.`,
    )
  }
}

if (problems.length > 0) {
  console.error(
    `[service-accessors] ${problems.length} accessor(s) a stopped application would leave behind:\n`,
  )
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    '\nAdd a clear* beside the getter, and call it from the provider only while ' +
      'the singleton is still the one that provider bound.',
  )
  process.exit(1)
}

const total = accessors().length
console.log(
  `[service-accessors] ok — ${total} accessor(s), each released on shutdown by the provider that bound it`,
)
