#!/usr/bin/env node
/**
 * What to publish now, and what has to wait for what.
 *
 * Each package is its own repository and its CI installs its @c9up siblings
 * from npm, not from this workspace. So a package whose manifest asks for a
 * sibling version npm does not have yet cannot pass CI — whatever its code —
 * until that sibling is published. Locally the workspace links every folder and
 * hides that order; this script reads it from the manifests and npm instead.
 *
 * For every package whose version is not on npm yet it reports:
 *   - the siblings it waits for (a range the published version does not meet);
 *   - whether its release tag sits on the head of its main branch;
 *   - the CI run of that head, when no sibling is missing.
 * A run cancelled because no hosted runner picked a job up is GitHub's
 * capacity, not the code: rerunning its failed jobs is enough.
 * Then the packages are grouped into waves: publish a wave, rerun, publish the
 * next.
 *
 *     node scripts/release-plan.mjs           # every package
 *     node scripts/release-plan.mjs --no-ci   # skip the GitHub lookups
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { satisfiesRange } from './lib/semver.mjs'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const withCi = !process.argv.includes('--no-ci')

/** Runs a command, answering its trimmed stdout, or `undefined` when it fails. */
async function attempt(command, args, cwd) {
  try {
    const { stdout } = await run(command, args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return stdout.trim()
  } catch {
    return undefined
  }
}

/** Every package of the workspace: npm name, version, and its @c9up ranges. */
function readPackages() {
  const found = []
  for (const dir of readdirSync(packagesDir).sort()) {
    const manifestPath = join(packagesDir, dir, 'package.json')
    const cargoPath = join(packagesDir, dir, 'Cargo.toml')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (!manifest.name || !manifest.version || manifest.private === true) continue
      const ranges = []
      const installed = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
      ])
      for (const section of ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
          if (!dep.startsWith('@c9up/') || typeof range !== 'string') continue
          // An optional peer the package does not install for itself is never
          // fetched by its CI: the application brings it, so nothing waits on it.
          const optionalPeer =
            section === 'peerDependencies' && manifest.peerDependenciesMeta?.[dep]?.optional === true
          if (optionalPeer && !installed.has(dep)) continue
          ranges.push({ dep, range, section })
        }
      }
      found.push({ dir, name: manifest.name, version: manifest.version, ranges })
    } else if (existsSync(cargoPath)) {
      // A Rust-only package published to npm under @c9up/<dir> (ream-cli).
      const version = /^version = "([^"]+)"/m.exec(readFileSync(cargoPath, 'utf8'))?.[1]
      if (version) found.push({ dir, name: `@c9up/${dir}`, version, ranges: [] })
    }
  }
  return found
}

/** Runs `task` over `items`, `limit` at a time. */
async function inBatches(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** The head of origin/main, the commit the release tag names, and the CI run of that head. */
async function gitState(pkg) {
  const cwd = join(packagesDir, pkg.dir)
  await attempt('git', ['fetch', '--quiet', 'origin', 'main', '--tags', '--force'], cwd)
  const head = await attempt('git', ['rev-parse', 'origin/main'], cwd)
  const tagged = await attempt('git', ['rev-parse', `v${pkg.version}^{commit}`], cwd)
  let ci
  if (withCi && head) {
    const json = await attempt(
      'gh',
      // Not filtered on the branch: a publish dispatched on the tag runs the
      // same commit and is the newest word on it.
      ['run', 'list', '--limit', '20', '--json', 'headSha,status,conclusion,event,url'],
      cwd,
    )
    const runs = json ? JSON.parse(json) : []
    const own = runs.find((r) => r.headSha === head)
    if (own) {
      const failed =
        own.status === 'completed' && own.conclusion !== 'success'
          ? await attempt('gh', ['run', 'view', own.url.split('/').pop(), '--json', 'jobs', '--jq', '[.jobs[]|select(.conclusion=="failure" or .conclusion=="cancelled")|"\\(.name) \\(.conclusion)"]|join(", ")'], cwd)
          : undefined
      ci = { status: own.status, conclusion: own.conclusion, event: own.event, failed, url: own.url }
    }
  }
  return { head, tagged, ci }
}

const packages = readPackages()
const npmVersions = await inBatches(packages, 8, async (pkg) => {
  const latest = await attempt('npm', ['view', pkg.name, 'version'], '/')
  const exact = latest === pkg.version ? latest : await attempt('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], '/')
  return { latest: latest || undefined, published: exact === pkg.version }
})
const byName = new Map(packages.map((pkg, i) => [pkg.name, { ...pkg, ...npmVersions[i] }]))

const pending = [...byName.values()].filter((pkg) => !pkg.published && pkg.latest !== undefined)
const neverPublished = [...byName.values()].filter((pkg) => pkg.latest === undefined)
const pendingNames = new Set(pending.map((pkg) => pkg.name))

/** Siblings a package cannot pass CI without: npm does not have a version its range admits. */
for (const pkg of pending) {
  pkg.waits = []
  pkg.impossible = []
  for (const { dep, range, section } of pkg.ranges) {
    const sibling = byName.get(dep)
    if (!sibling) continue
    if (sibling.latest && satisfiesRange(range, sibling.latest)) continue
    if (pendingNames.has(dep) && satisfiesRange(range, sibling.version)) {
      if (!pkg.waits.some((w) => w.dep === dep && w.range === range)) {
        pkg.waits.push({ dep, range, section, npm: sibling.latest ?? 'none' })
      }
    } else {
      pkg.impossible.push({ dep, range, section, npm: sibling.latest ?? 'none', local: sibling.version })
    }
  }
}

const states = await inBatches(pending, 6, gitState)
pending.forEach((pkg, i) => Object.assign(pkg, states[i]))

/** Waves: a package goes in the first wave after every sibling it waits for. */
const waves = []
const placed = new Set()
while (placed.size < pending.length) {
  const wave = pending.filter(
    (pkg) => !placed.has(pkg.name) && pkg.waits.every((w) => placed.has(w.dep)),
  )
  if (wave.length === 0) {
    waves.push({ cycle: pending.filter((pkg) => !placed.has(pkg.name)) })
    break
  }
  wave.forEach((pkg) => placed.add(pkg.name))
  waves.push({ packages: wave })
}

const short = (name) => name.replace('@c9up/', '')

/** What stands between a package of the first wave and its publish, if anything. */
function blockers(pkg) {
  const out = []
  if (pkg.impossible.length > 0) {
    for (const i of pkg.impossible) {
      out.push(`${i.section}.${short(i.dep)} "${i.range}" admits neither npm ${i.npm} nor the workspace ${i.local}`)
    }
  }
  if (!pkg.tagged) out.push(`no tag v${pkg.version}`)
  else if (pkg.head && pkg.tagged !== pkg.head) out.push(`tag v${pkg.version} is not on main's head`)
  if (withCi) {
    if (!pkg.ci) out.push('no CI run for main\'s head')
    else if (pkg.ci.status !== 'completed') out.push(`CI ${pkg.ci.status}`)
    else if (pkg.ci.conclusion !== 'success') {
      out.push(`CI (${pkg.ci.event}) ${pkg.ci.conclusion}${pkg.ci.failed ? `: ${pkg.ci.failed}` : ''} — ${pkg.ci.url}`)
    }
  }
  return out
}

console.log(`Release plan — ${pending.length} package(s) ahead of npm\n`)
waves.forEach((wave, index) => {
  if (wave.cycle) {
    console.log('Cycle — these wait on each other:')
    for (const pkg of wave.cycle) console.log(`  ${short(pkg.name)} waits on ${pkg.waits.map((w) => short(w.dep)).join(', ')}`)
    return
  }
  if (index === 0) {
    const ready = wave.packages.filter((pkg) => blockers(pkg).length === 0)
    const held = wave.packages.filter((pkg) => blockers(pkg).length > 0)
    console.log('Publish now:')
    for (const pkg of ready) console.log(`  ${short(pkg.name)} ${pkg.version}`)
    if (ready.length === 0) console.log('  (nothing)')
    if (held.length > 0) {
      console.log('\nNo sibling missing, but not ready:')
      for (const pkg of held) console.log(`  ${short(pkg.name)} ${pkg.version} — ${blockers(pkg).join('; ')}`)
    }
  } else {
    console.log(`\nThen, wave ${index + 1}:`)
    for (const pkg of wave.packages) {
      const waits = pkg.waits.map((w) => `${short(w.dep)} ${w.range} (npm ${w.npm})`).join(', ')
      console.log(`  ${short(pkg.name)} ${pkg.version} — waits for ${waits}`)
    }
  }
})
if (neverPublished.length > 0) {
  console.log(`\nNever published (left out): ${neverPublished.map((pkg) => `${short(pkg.name)} ${pkg.version}`).join(', ')}`)
}
console.log('\nRerun after each publish: a wave only moves up once npm has what it waits for.')
