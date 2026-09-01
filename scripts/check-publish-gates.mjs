/**
 * Every publish job must wait for every job that verifies something.
 *
 * atlas 0.3.10 went to npm with `Integration (real DB)` red: `publish` listed
 * `[quality, build-and-test, cargo-tests, ts-tests]` in `needs` and simply did
 * not name `integration`, so the two ran side by side and the package shipped
 * while the failure was still on screen. What slipped through happened to be a
 * test-isolation race rather than a defect in the code — which is luck, and
 * luck is not a release gate.
 *
 * A workflow is a list, and a list loses an entry without anyone noticing. This
 * turns "did we remember" into something the build answers.
 *
 * Four ways a release can go out over a failure, all checked here:
 *
 *   1. a verification job missing from the publish job's transitive `needs`
 *   2. a publish reachable without a human — anything but workflow_dispatch
 *   3. `continue-on-error`, which makes a red job report green
 *   4. `… || true` on a verification command, which throws its exit code away
 *
 *     node scripts/check-publish-gates.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const PACKAGES = 'packages'
/** Commands whose failure must stop a release. */
const VERIFIES = /vitest|cargo\s+(test|clippy|fmt)|tsc\b|biome|pnpm\s+(test|lint)|npm\s+test/i
/** `|| true`, `|| :`, `|| exit 0` — an exit code thrown away. */
const SWALLOWS = /\|\|\s*(true|:|exit\s+0)\b/

/** `needs:` accepts a string or a list; both mean the same thing. */
const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/** Everything a job waits for, including what those jobs wait for. */
function transitiveNeeds(jobs, id) {
  const seen = new Set()
  const stack = asList(jobs[id]?.needs)
  while (stack.length > 0) {
    const next = stack.pop()
    if (seen.has(next) || !(next in jobs)) continue
    seen.add(next)
    stack.push(...asList(jobs[next].needs))
  }
  return seen
}

/** The triggers, normalised — `on:` is a string, a list or a map. */
function triggers(doc) {
  // `on` is YAML 1.1 truthy, so a parser may hand it back as the boolean true.
  const on = doc?.on ?? doc?.[true] ?? {}
  if (typeof on === 'string') return [on]
  return Array.isArray(on) ? on : Object.keys(on)
}

const problems = []

for (const pkg of readdirSync(PACKAGES).sort()) {
  const dir = join(PACKAGES, pkg, '.github', 'workflows')
  if (!existsSync(dir)) continue

  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const path = join(dir, file)
    let doc
    try {
      doc = parse(readFileSync(path, 'utf8'))
    } catch (error) {
      problems.push(`${pkg}/${file}: unreadable (${error.message})`)
      continue
    }
    const jobs = doc?.jobs ?? {}
    const where = `${pkg}/${file}`

    for (const [id, job] of Object.entries(jobs)) {
      if (job == null || typeof job !== 'object') continue
      const body = JSON.stringify(job)

      // (3) and (4) apply to every job, publish or not: a verification that
      // cannot fail is not a verification.
      if (job['continue-on-error']) {
        problems.push(`${where}: job '${id}' is continue-on-error — it reports green when it is red`)
      }
      for (const step of job.steps ?? []) {
        if (step?.['continue-on-error']) {
          problems.push(`${where}: step '${step.name ?? step.run ?? '?'}' in '${id}' is continue-on-error`)
        }
        const run = String(step?.run ?? '')
        if (VERIFIES.test(run) && SWALLOWS.test(run)) {
          problems.push(`${where}: '${id}' throws away the exit code of a verification: ${run.trim().split('\n')[0]}`)
        }
      }

      const publishes = /npm publish|pnpm publish|NPM_TOKEN/.test(body)
      if (!publishes) continue

      // (2) a release is a person's decision, so the only way in is a manual
      // dispatch — either the whole file has no other trigger, or the job says so.
      const fileIsManual = triggers(doc).join(',') === 'workflow_dispatch'
      const jobIsManual = String(job.if ?? '').includes('workflow_dispatch')
      if (!fileIsManual && !jobIsManual) {
        problems.push(`${where}: '${id}' publishes without a workflow_dispatch gate`)
      }

      // (1) the one that actually bit.
      const waitsFor = transitiveNeeds(jobs, id)
      const ungated = Object.entries(jobs)
        .filter(([other, j]) => other !== id && !waitsFor.has(other) && VERIFIES.test(JSON.stringify(j)))
        .map(([other]) => other)
      if (ungated.length > 0) {
        problems.push(
          `${where}: '${id}' does not wait for ${ungated.map((j) => `'${j}'`).join(', ')} — a red one there publishes anyway`,
        )
      }
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`\n${problems.length} publish gate problem(s):\n\n`)
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`)
  process.stderr.write('\n')
  process.exit(1)
}
process.stdout.write('publish gates: every publish waits for every verification\n')
