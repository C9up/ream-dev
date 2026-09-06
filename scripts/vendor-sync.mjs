#!/usr/bin/env node
/**
 * One authored copy, N generated ones.
 *
 * Some code belongs in several packages and cannot be a dependency: each
 * package here is published from its OWN repository and its CI runs
 * `pnpm install && pnpm build` seeing nothing but that repository. A workspace
 * package, a `bundledDependencies` entry, a symlink or a build-time generator
 * living in this monorepo would all resolve to nothing there. The file has to
 * physically exist in each package.
 *
 * So the copies are not a choice, and the only question left is who writes
 * them. Here: nobody. `scripts/vendor/<name>.ts` is authored, the copies are
 * generated with a header saying so, and `--check` fails when one has drifted.
 * Editing one file is what "shared" means once a live import is off the table.
 *
 *   node scripts/vendor-sync.mjs            rewrite every copy
 *   node scripts/vendor-sync.mjs --check    fail if any copy is stale
 *
 * A package joins a unit only if a byte-identical copy is legal there: the
 * framework itself is absent from `nodeEnv` because it formats to different
 * rules and exposes a different function.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Which packages carry which vendored unit, and where it lands in each. */
const UNITS = [
  {
    source: 'nodeEnv.ts',
    target: 'src/vendor/nodeEnv.ts',
    packages: ['bay', 'blackhole', 'inker'],
  },
  {
    source: 'nativeBinary.ts',
    target: 'src/vendor/nativeBinary.ts',
    // atom and chronos are absent on purpose: both have a browser/WASM path and
    // load node builtins dynamically, so a copy importing `node:module` at the
    // top would break their bundle. The boundary of a unit is set by the
    // consumers' constraints, not by how alike the code looks.
    packages: ['rune', 'sigil', 'vellum', 'warden'],
  },
  {
    source: 'quasarConnection.ts',
    target: 'src/vendor/quasarConnection.ts',
    packages: ['bay', 'blackhole', 'echo', 'nova', 'relay', 'transit', 'warden'],
  },
]

/** The copy, byte for byte: the header plus the authored file. */
function render(unit) {
  const authored = readFileSync(join(root, 'scripts/vendor', unit.source), 'utf8')
  return (
    `// Generated from scripts/vendor/${unit.source} — do not edit.\n` +
    `//\n` +
    `// This package is published and built from its own repository, so the file\n` +
    `// has to exist here rather than be imported. \`pnpm vendor:sync\` rewrites it,\n` +
    `// and \`pnpm vendor:check\` fails if this copy has drifted from the original.\n` +
    `\n` +
    authored
  )
}

const check = process.argv.includes('--check')
const stale = []
let written = 0
let copies = 0

for (const unit of UNITS) {
  const expected = render(unit)
  for (const pkg of unit.packages) {
    const file = join(root, 'packages', pkg, unit.target)
    copies += 1
    const current = existsSync(file) ? readFileSync(file, 'utf8') : undefined
    if (current === expected) continue
    if (check) {
      stale.push(`${pkg}/${unit.target} ${current === undefined ? 'is missing' : 'has drifted'}`)
      continue
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, expected)
    written += 1
  }
}

if (check) {
  if (stale.length > 0) {
    console.error(`[vendor] ${stale.length} generated copy(ies) no longer match their source:\n`)
    for (const entry of stale) console.error(`  ${entry}`)
    console.error('\nEdit scripts/vendor/<name>.ts and run `pnpm vendor:sync`.')
    process.exit(1)
  }
  console.log(`[vendor] ok — ${copies} generated copy(ies) match their source`)
} else {
  console.log(`[vendor] ${written} of ${copies} copy(ies) rewritten`)
}
