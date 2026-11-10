/**
 * The slice of npm's range rules the release scripts need: carets (with the
 * 0.x rule), `||` alternatives, and the open ranges `*`, `x` and `latest`.
 */

/**
 * Whether `version` satisfies a range, for the 0.x rules npm applies.
 *
 * `||` is a real range and a legitimate answer to a breaking bump: a package
 * that works with BOTH lines should say so. Each alternative is tried and one
 * match is enough.
 */
export function satisfiesRange(range, version) {
  return range
    .split('||')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .some((part) => satisfiesOne(part, version))
}

function satisfiesOne(range, version) {
  if (range === '*' || range === 'x' || range === 'latest') return true
  if (/^\d+\.\d+\.\d+$/.test(range)) return range === version
  return satisfiesCaret(range, version)
}

/** Whether `version` satisfies ONE caret range, for the 0.x rules npm applies. */
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
