#!/usr/bin/env node
/**
 * Refuse a peer range that excludes the version it ships beside.
 *
 * Every package here is published from the same workspace on the same day, so
 * `"@c9up/ream": "^0.1.0"` sitting next to ream 0.2.3 is not a stale range —
 * it is a package that rejects the framework it was built against. npm then
 * warns on every install, and the warning is indistinguishable from a real
 * incompatibility.
 *
 * It kept coming back because nothing checked it: four packages published with
 * a ^0.1.x range on the very evening ream went to 0.2.3. Hence a gate rather
 * than another pass by hand.
 *
 * Exits non-zero and names every offender, so one run fixes the whole set.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')

/** name → version, for every package in this workspace. */
const workspace = new Map()
const manifests = []

for (const entry of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, entry, 'package.json')
  try {
    if (!statSync(manifestPath).isFile()) continue
  } catch {
    continue
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!manifest.name || !manifest.version) continue
  workspace.set(manifest.name, manifest.version)
  manifests.push({ dir: entry, manifest })
}

/** Whether `version` satisfies a caret range, for the 0.x rules npm applies. */
function satisfiesCaret(range, version) {
  const match = /^\^(\d+)\.(\d+)\.(\d+)/.exec(range)
  if (!match) return true // not a caret range — out of scope, leave it alone
  const [, rMajor, rMinor, rPatch] = match.map(Number)
  const parsed = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!parsed) return true
  const [, vMajor, vMinor, vPatch] = parsed.map(Number)

  if (vMajor !== rMajor) return false
  // Below 1.0.0, caret pins the MINOR: ^0.1.0 does not admit 0.2.0.
  if (rMajor === 0) {
    if (vMinor !== rMinor) return false
    return vPatch >= rPatch
  }
  if (vMinor !== rMinor) return vMinor > rMinor
  return vPatch >= rPatch
}

const offenders = []
for (const { dir, manifest } of manifests) {
  for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
    for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
      const shipped = workspace.get(dep)
      if (!shipped) continue // not a workspace package
      if (typeof range !== 'string' || range.startsWith('workspace:')) continue
      if (!satisfiesCaret(range, shipped)) {
        offenders.push({ dir, section, dep, range, shipped })
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(`[peer-ranges] ${offenders.length} range(s) exclude the version they ship beside:\n`)
  for (const o of offenders) {
    console.error(`  ${o.dir}: ${o.section}.${o.dep} = "${o.range}" but the workspace ships ${o.shipped}`)
  }
  console.error('\nWiden the range, or bump the dependency to a version the range admits.')
  process.exit(1)
}

console.log(`[peer-ranges] ok — ${manifests.length} packages, no range excludes a workspace version`)
