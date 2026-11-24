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
 *   6. a Rust package with no advisory gate, or a gate that lets warnings
 *      through: a Cargo.lock nothing re-audits goes red silently. Once the job
 *      exists, (1) makes the publish wait. `cargo audit --deny yanked` passed
 *      unmaintained and unsound advisories in all seventeen packages, so the
 *      gate must be `cargo audit --deny warnings` with no flag that narrows it,
 *      or `cargo deny check advisories` over a deny.toml that denies yanked.
 *      What a package accepts lives in its `.cargo/audit.toml`, one id at a
 *      time, each under the comment that says why — nothing else in that file.
 *   7. a workflow-level `cancel-in-progress: true`: a second dispatch then
 *      cancels a publish in flight, between `npm publish` and the release.
 *   8. a package whose binaries ship as one npm package per platform
 *      (`npm/<suffix>/package.json`, the napi-rs layout) with a platform
 *      package at another version than its own, an optionalDependencies pin
 *      that is not that exact version, or a publish job that does not run
 *      `platform-packages.mjs --check` first: the main package would then
 *      install binaries built from other Rust, or none at all.
 *   9. a package whose Rust binaries ship as platform packages (8), or whose
 *      publish job writes its npm packages itself (ream-cli), without
 *      THIRD-PARTY-NOTICES.md (the licence notices of the crates they link)
 *      in its main package and in every platform package, copied in by the
 *      publish job, and checked
 *      against Cargo.lock by `third-party-notices.mjs --check` in a job the
 *      publish waits for: MIT, BSD and ISC require the notice with every copy.
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
/** A `cargo audit` invocation, to the end of its command line. */
const CARGO_AUDIT = /cargo\s+audit\b[^\n]*/g
/** `cargo deny … check … advisories`, the other accepted advisory gate. */
const CARGO_DENY = /cargo\s+deny\b[^\n]*\bcheck\b[^\n]*\badvisories\b/
/** What turns every warning kind (unmaintained, unsound, yanked) into a failure. */
const DENIES_WARNINGS = /(?:--deny|-D)[\s=]+warnings\b/
/**
 * Flags that narrow the audit from the command line: an ignore with no reason
 * on record, yanked checks off, a stale or unfetched database, a target filter.
 */
const NARROWS = /--ignore\b|--no-yanked\b|--stale\b|--no-fetch\b|\s-n\b|--target-(?:os|arch)\b/
/** The only lines `.cargo/audit.toml` may hold once comments are set aside. */
const AUDIT_TOML_LINE = /^(?:\[advisories\]|ignore\s*=\s*\[|"RUSTSEC-\d{4}-\d{4}",?|\])$/

/** Every `run:` script in the workflow, one string per step, `\` continuations joined. */
const runScripts = (jobs) =>
  Object.values(jobs).flatMap((job) =>
    (job?.steps ?? []).map((step) => String(step?.run ?? '').replace(/\\\n\s*/g, ' ')),
  )

/**
 * `.cargo/audit.toml` is where a package accepts an advisory. It may list ids
 * and nothing else — no severity threshold, no target filter, no yanked switch,
 * no `informational_warnings` — and each id sits under a comment giving the
 * reason and what lets it go.
 */
function auditTomlProblems(root, where) {
  const path = join(root, '.cargo', 'audit.toml')
  if (!existsSync(path)) return []
  const problems = []
  let commented = false
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (line === '') {
      commented = false
      continue
    }
    if (line.startsWith('#')) {
      commented = true
      continue
    }
    if (!AUDIT_TOML_LINE.test(line)) {
      problems.push(`${where}: .cargo/audit.toml may only list advisory ids to ignore, found '${line}'`)
    } else if (line.startsWith('"') && !commented) {
      problems.push(`${where}: .cargo/audit.toml ignores ${line.replace(/[",]/g, '')} with no comment giving the reason`)
    }
  }
  return problems
}

/** The advisory gate of a Rust package: present, and denying every warning. */
function advisoryProblems(root, jobs, where) {
  const scripts = runScripts(jobs)
  const audits = scripts.flatMap((run) => run.match(CARGO_AUDIT) ?? [])
  const denies = scripts.filter((run) => CARGO_DENY.test(run))
  if (audits.length === 0 && denies.length === 0) {
    return [`${where}: Cargo.lock is audited by no job (cargo audit --deny warnings / cargo deny check advisories)`]
  }
  const problems = []
  for (const command of audits) {
    if (!DENIES_WARNINGS.test(command)) {
      problems.push(`${where}: '${command.trim()}' does not deny every warning (unmaintained, unsound, yanked) — use --deny warnings`)
    }
    if (NARROWS.test(command)) {
      problems.push(
        `${where}: '${command.trim()}' narrows the audit from the command line — accept an advisory in .cargo/audit.toml, with its reason`,
      )
    }
  }
  if (denies.length > 0) {
    const config = join(root, 'deny.toml')
    if (!existsSync(config) || !/^\s*yanked\s*=\s*"deny"/m.test(readFileSync(config, 'utf8'))) {
      problems.push(`${where}: cargo deny check advisories without a deny.toml that sets yanked = "deny"`)
    }
  }
  return [...problems, ...auditTomlProblems(root, where)]
}
/**
 * (8) The platform packages a package publishes beside itself: each pinned by
 * the main manifest at its exact version, and checked by the publish job.
 */
function platformPackageProblems(root, publishJob, where) {
  const npmDir = join(root, 'npm')
  if (!existsSync(npmDir)) return []
  const main = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const problems = []
  for (const suffix of readdirSync(npmDir).sort()) {
    const path = join(npmDir, suffix, 'package.json')
    if (!existsSync(path)) continue
    const platform = JSON.parse(readFileSync(path, 'utf8'))
    if (platform.name !== `${main.name}-${suffix}`) {
      problems.push(`${where}: npm/${suffix} is named ${platform.name}, not ${main.name}-${suffix}`)
    }
    if (platform.version !== main.version) {
      problems.push(`${where}: npm/${suffix} is at ${platform.version}, ${main.name} at ${main.version}`)
    }
    const pin = main.optionalDependencies?.[platform.name]
    if (pin !== main.version) {
      problems.push(`${where}: optionalDependencies pins ${platform.name} at ${pin ?? 'nothing'}, not exactly ${main.version}`)
    }
  }
  if (!runScripts({ publishJob }).some((run) => /platform-packages\.mjs\s+--check\b/.test(run))) {
    problems.push(`${where}: the publish job does not run 'platform-packages.mjs --check' before publishing`)
  }
  return problems
}

/**
 * (9) The third-party notices shipped beside the binaries: listed by every
 * manifest that ships a binary, copied in by the publish job, and kept to
 * Cargo.lock by a check the publish waits for.
 */
const NOTICES = 'THIRD-PARTY-NOTICES.md'
function noticeProblems(root, jobs, publishId, where) {
  const npmDir = join(root, 'npm')
  const hasManifest = existsSync(join(root, 'package.json'))
  // Rust shipped as platform packages, or a Rust-only repository whose publish
  // job writes its npm manifests itself (ream-cli).
  if (!existsSync(join(root, 'Cargo.lock')) || (hasManifest && !existsSync(npmDir))) return []
  const problems = []
  if (!existsSync(join(root, NOTICES))) problems.push(`${where}: no ${NOTICES} beside the Rust package`)
  const manifests = hasManifest ? ['package.json'] : []
  if (existsSync(npmDir)) {
    for (const suffix of readdirSync(npmDir).sort()) {
      if (existsSync(join(npmDir, suffix, 'package.json'))) manifests.push(join('npm', suffix, 'package.json'))
    }
  }
  for (const manifest of manifests) {
    const { files } = JSON.parse(readFileSync(join(root, manifest), 'utf8'))
    if (!Array.isArray(files) || !files.includes(NOTICES)) {
      problems.push(`${where}: ${manifest} does not list ${NOTICES} in files`)
    }
  }
  if (!runScripts({ publish: jobs[publishId] }).some((run) => /\bcp\b[^\n]*THIRD-PARTY-NOTICES\.md/.test(run))) {
    problems.push(`${where}: the publish job does not copy ${NOTICES} into the packages it publishes`)
  }
  const waitsFor = [...transitiveNeeds(jobs, publishId)].map((id) => jobs[id])
  if (!runScripts(waitsFor).some((run) => /third-party-notices\.mjs\s+--check\b/.test(run))) {
    problems.push(`${where}: no job the publish waits for runs 'third-party-notices.mjs --check'`)
  }
  return problems
}

/**
 * Commands whose failure must stop a release.
 *
 * `cargo build` and `pnpm build` are in here because a build IS a
 * verification: ream-cli's release is a set of compiled binaries, and dropping
 * its build job would have left this check with nothing to complain about.
 */
const VERIFIES =
  /vitest|cargo\s+(test|clippy|fmt|deny|audit|build)|tsc\b|biome|pnpm\s+(test|lint|build)|npm\s+test|quality-rust|third-party-notices\.mjs/i
/** `|| true`, `|| :`, `|| exit 0` — an exit code thrown away. */
const SWALLOWS = /\|\|\s*(true|:|exit\s+0)\b/

/** `needs:` accepts a string or a list; both mean the same thing. */
const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/** Everything a job waits for, including what those jobs wait for. */
function transitiveNeeds(jobs, id) {
  const seen = new Set()
  // A copy: popping the job's own list would empty its `needs` for the next caller.
  const stack = [...asList(jobs[id]?.needs)]
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
    if (root !== '.' && existsSync(join(root, 'Cargo.lock'))) {
      problems.push(...advisoryProblems(root, jobs, where))
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

      // (8) the platform packages published beside the package.
      if (root !== '.') problems.push(...platformPackageProblems(root, job, where))

      // (9) the licence notices of what the binaries link.
      if (root !== '.') problems.push(...noticeProblems(root, jobs, id, where))

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
