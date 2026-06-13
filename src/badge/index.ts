import { execSync } from 'node:child_process'

/**
 * Detect GitHub owner and repo from git remote origin URL.
 * Supports HTTPS and SSH URLs.
 *
 * @returns {owner, repo} or null if not a GitHub repo
 */
export function detectGitHubRepo(rootDir: string): { owner: string, repo: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] }
    }

    // SSH: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get the color for a given score (shields.io color name).
 * green: 80+, yellow: 50-79, orange: 30-49, red: 0-29
 */
export function scoreColor(score: number): string {
  if (score >= 80) return 'green'
  if (score >= 50) return 'yellow'
  if (score >= 30) return 'orange'
  return 'red'
}

/**
 * Generate a shields.io badge URL for a given owner/repo/score.
 *
 * Format: https://img.shields.io/badge/deep--slop-{score}-{color}.svg
 */
export function generateBadgeUrl(owner: string, repo: string, score?: number): string {
  const scoreStr = score !== undefined ? String(score) : 'pending'
  const color = score !== undefined ? scoreColor(score) : 'lightgrey'
  return `https://img.shields.io/badge/deep--slop-${scoreStr}-${color}.svg`
}

/**
 * Generate Markdown for embedding the badge in a README.
 */
export function generateBadgeMarkdown(owner: string, repo: string, score: number): string {
  const badgeUrl = generateBadgeUrl(owner, repo, score)
  const pageUrl = `https://github.com/${owner}/${repo}`
  return `![deep-slop](${badgeUrl})](${pageUrl})`
}

/**
 * Generate the shields.io endpoint URL for dynamic badge.
 * This uses the shields.io endpoint API for real-time score updates.
 */
export function generateBadgeEndpointUrl(owner: string, repo: string): string {
  return `https://img.shields.io/endpoint?url=https://deep-slop.dev/api/badge/${owner}/${repo}`
}

