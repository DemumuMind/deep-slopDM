// ── Update Notifier ────────────────────────────────────
// Checks npm registry for newer versions, with 24h cache

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_VERSION } from './version.js'
import { style } from './output/theme.js'

const CACHE_DIR = join(homedir(), '.deep-slop')
const CACHE_FILE = join(CACHE_DIR, 'update_check.json')
const REGISTRY_URL = 'https://registry.npmjs.org/deep-slop/latest'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface UpdateCache {
  lastCheck: number
  latest: string
}

interface UpdateInfo {
  current: string
  latest: string
  isOutdated: boolean
}

/** Whether update checks should be skipped */
function shouldSkip(): boolean {
  if (process.env.CI) return true
  if (process.env.NO_UPDATE_NOTIFIER === '1') return true
  if (process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER === '1') return true
  return false
}

/** Read cached update info if fresh (< 24h) */
async function readCache(): Promise<UpdateCache | null> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8')
    const cache: UpdateCache = JSON.parse(raw)
    if (Date.now() - cache.lastCheck < CACHE_TTL_MS) {
      return cache
    }
  } catch {
    // File doesn't exist or is invalid — proceed to fetch
  }
  return null
}

/** Write update cache to disk */
async function writeCache(latest: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    const data: UpdateCache = { lastCheck: Date.now(), latest }
    await writeFile(CACHE_FILE, JSON.stringify(data))
  } catch {
    // Best-effort — don't fail on cache write errors
  }
}

/** Fetch latest version from npm registry */
async function fetchLatest(): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const body = await res.json() as { version?: string }
    return body.version ?? null
  } catch {
    return null
  }
}

/** Compare two semver strings. Returns true if a > b */
function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

/**
 * Check if an update is available.
 * Returns null if checks are disabled or the fetch fails.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (shouldSkip()) return null

  // Try cache first
  const cached = await readCache()
  let latest: string | null = cached?.latest ?? null

  if (!latest) {
    latest = await fetchLatest()
    if (!latest) return null
    await writeCache(latest)
  }

  const isOutdated = semverGt(latest, APP_VERSION)

  return {
    current: APP_VERSION,
    latest,
    isOutdated,
  }
}

/** Print a non-blocking update notification to stderr */
export function showUpdateNotification(info: UpdateInfo): void {
  process.stderr.write(
    `\n  ${style('warn', 'Update available:')} ${info.current} → ${style('success', info.latest)}\n` +
    `  Run ${style('info', 'pnpm update deep-slop')} to update\n\n`,
  )
}

