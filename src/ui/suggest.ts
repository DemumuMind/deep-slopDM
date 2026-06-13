// ── Command Typo Suggestions ───────────────────────────
// Levenshtein-based closest match for unknown commands

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return dp[m][n]
}

/**
 * Suggest the closest matching command from a list of candidates.
 *
 * Budget: max(2, ceil(len/3)) — shorter strings allow fewer edits.
 * Returns the closest match within budget, or null if nothing is close enough.
 */
export function suggestClosest(token: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null

  const budget = Math.max(2, Math.ceil(token.length / 3))
  let bestMatch: string | null = null
  let bestDist = Infinity

  for (const candidate of candidates) {
    const dist = levenshtein(token, candidate)
    if (dist < bestDist && dist <= budget) {
      bestDist = dist
      bestMatch = candidate
    }
  }

  return bestMatch
}

