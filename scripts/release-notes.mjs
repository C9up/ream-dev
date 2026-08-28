#!/usr/bin/env node
/**
 * Build release notes for a package tag, from the commits it contains.
 *
 * Every package here publishes from a tag and ships no notes: npm shows a
 * version, GitHub shows none, and a consumer upgrading has no way to know what
 * changed short of reading a diff. The commit messages already carry the
 * reasoning — this turns them into the notes rather than asking anyone to
 * write them twice.
 *
 *   node scripts/release-notes.mjs <package> [tag]
 *
 * With no tag, the package's latest one. Prints markdown on stdout; pipe it to
 * `gh release create <tag> -R C9up/<package> --notes-file -`.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const [pkg, wantedTag] = process.argv.slice(2)
if (!pkg) {
  console.error('usage: release-notes.mjs <package> [tag]')
  process.exit(2)
}

const cwd = join(root, 'packages', pkg)
if (!existsSync(cwd)) {
  console.error(`no such package: ${pkg}`)
  process.exit(2)
}

const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const tag = wantedTag ?? git('describe', '--tags', '--abbrev=0')

/**
 * The tag this one supersedes.
 *
 * `describe` from the tag's parent rather than sorting by name: a version
 * ordering would pick 0.1.9 over 0.1.10, and a date ordering breaks whenever a
 * tag is moved.
 */
let previous
try {
  previous = git('describe', '--tags', '--abbrev=0', `${tag}^`)
} catch {
  previous = undefined
}

const range = previous ? `${previous}..${tag}` : tag
// A unit separator between fields and a record separator between commits, so a
// message containing blank lines survives the split.
const raw = git('log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e')

const commits = raw
  .split('\x1e')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [hash, subject, body] = entry.split('\x1f')
    return { hash: hash.slice(0, 7), subject: subject ?? '', body: (body ?? '').trim() }
  })
  // A pure version bump says nothing a reader of the version number does not
  // already know.
  .filter((c) => !/^[\w-]+ \d+\.\d+\.\d+$/.test(c.subject))

const lines = [`## ${pkg} ${tag.replace(/^v/, '')}`, '']

if (commits.length === 0) {
  lines.push('_Version bump only — no behavioural change._')
} else {
  for (const { hash, subject, body } of commits) {
    lines.push(`### ${subject}`, '')
    if (body) lines.push(body, '')
    lines.push(`\`${hash}\``, '')
  }
}

if (previous) {
  lines.push('---', '', `Changes since \`${previous}\`.`)
}

console.log(lines.join('\n'))
