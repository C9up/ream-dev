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
 * And three ways the release itself is exposed:
 *
 *   5. an action referenced by tag or branch: whoever can move that ref runs
 *      code in the job, the publish job and its token included. Only a full
 *      commit SHA is accepted (a local `./` action is the repository itself).
 *   6. a Rust package with no advisory gate: a Cargo.lock nothing re-audits
 *      goes red silently. Once the job exists, (1) makes the publish wait.
 *   7. a workflow-level `cancel-in-progress: true`: a second dispatch then
 *      cancels a publish in flight, between `npm publish` and the release.
 *
 * What it cannot see: a verification step skipped by its own step-level `if:`
 * (a matrix leg that only builds is legitimate and looks the same).
 *
 *     node scripts/check-publish-gates.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const PACKAGES = 'packages'
/** `owner/repo[/path]@<40 hex>` — the only way a third-party action is run. */
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
/** A job that reaches the registry. */
const PUBLISHES = /npm publish|pnpm publish|NPM_TOKEN/
/** An advisory gate over Cargo.lock. */
const AUDITS = /cargo\s+audit\b|cargo\s+deny\b[^\n]*\bcheck\b[^\n]*\badvisories\b/
/**
 * Commands whose failure must stop a release.
 *
 * `cargo build` and `pnpm build` are in here because a build IS a
 * verification: ream-cli's release is a set of compiled binaries, and dropping
 * its build job would have left this check with nothing to complain about.
 */
const VERIFIES =
  /vitest|cargo\s+(test|clippy|fmt|deny|audit|build)|tsc\b|biome|pnpm\s+(test|lint|build)|npm\s+test|quality-rust/i
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

// The monorepo's own workflows too: they publish nothing, but an unpinned
// action there runs with this repository's token all the same.
const repositories = [
  { pkg: 'ream-dev', root: '.' },
  ...readdirSync(PACKAGES)
    .sort()
    .map((pkg) => ({ pkg, root: join(PACKAGES, pkg) })),
]

for (const { pkg, root } of repositories) {
  const dir = join(root, '.github', 'workflows')
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

    // (7) a dispatch must queue behind a publish, not cancel it. A workflow
    // that publishes nothing may cancel freely.
    const publishesAny = Object.values(jobs).some((job) => PUBLISHES.test(JSON.stringify(job ?? {})))
    if (publishesAny && doc?.concurrency?.['cancel-in-progress'] === true) {
      problems.push(`${where}: 'cancel-in-progress: true' lets a second dispatch cancel a publish in flight`)
    }

    // (6) the advisory gate, for every package that ships Rust.
    if (root !== '.' && existsSync(join(root, 'Cargo.lock')) && !AUDITS.test(JSON.stringify(jobs))) {
      problems.push(`${where}: Cargo.lock is audited by no job (cargo audit / cargo deny check advisories)`)
    }

    for (const [id, job] of Object.entries(jobs)) {
      if (job == null || typeof job !== 'object') continue
      const body = JSON.stringify(job)

      // (5) every action pinned to a commit, a reusable workflow included.
      for (const ref of [job.uses, ...(job.steps ?? []).map((step) => step?.uses)]) {
        if (ref == null || String(ref).startsWith('./')) continue
        if (!PINNED.test(String(ref))) {
          problems.push(`${where}: '${id}' runs '${ref}' — pin it to a full commit SHA`)
        }
      }

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

      const publishes = PUBLISHES.test(body)
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
