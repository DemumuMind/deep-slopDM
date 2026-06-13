// ── Zero-dependency fuzzy search + select prompt ─────────
// Built on raw readline. Type-to-filter, arrow navigate, enter confirm, escape cancel.

import * as readline from 'node:readline'
import { style, styleBold } from '../output/theme.js'

export interface SearchSelectOptions<T> {
  /** Prompt label shown to the user */
  label: string
  /** Extract searchable text from each item */
  filter: (item: T) => string
}

/** Simple substring-based fuzzy rank: more matches & earlier matches rank higher */
function fuzzyRank(query: string, text: string): number {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  if (lower === q) return 1000
  if (lower.startsWith(q)) return 500
  if (lower.includes(q)) return 200

  // Character-by-character fuzzy
  let qi = 0
  let score = 0
  for (let ti = 0; ti < lower.length && qi < q.length; ti++) {
    if (lower[ti] === q[qi]) {
      score += 1
      qi++
    }
  }
  return qi === q.length ? score : 0
}

/**
 * Interactive fuzzy search prompt.
 * Returns selected item or null (escape / ctrl-c).
 * Falls back to first item if no query entered.
 */
export async function searchSelect<T>(
  items: T[],
  options: SearchSelectOptions<T>,
): Promise<T | null> {
  if (items.length === 0) return null

  return new Promise<T | null>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    // Switch to raw mode for key-by-key input
    const wasRaw = process.stdin.isRaw
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let query = ''
    let cursor = 0
    let filtered: T[] = [...items]
    let activeIndex = 0

    function rank(): void {
      if (query === '') {
        filtered = [...items]
      } else {
        const ranked = items
          .map((item) => ({ item, score: fuzzyRank(query, options.filter(item)) }))
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score)
        filtered = ranked.map((e) => e.item)
      }
      if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1)
    }

    function render(): void {
      if (!process.stdout.isTTY) return
      // Move cursor up to rewrite
      const lines = Math.min(filtered.length, 10) + 2
      process.stdout.write(`\x1b[${lines}A\x1b[0J`)

      // Query line
      process.stdout.write(`  ${styleBold('info', options.label)} ${query}_\n`)

      // Items
      const visible = filtered.slice(0, 10)
      for (let i = 0; i < visible.length; i++) {
        const label = options.filter(visible[i])
        if (i === activeIndex) {
          process.stdout.write(`  ${style('info', '❯')} ${styleBold('info', label)}\n`)
        } else {
          process.stdout.write(`    ${style('muted', label)}\n`)
        }
      }
      if (filtered.length > 10) {
        process.stdout.write(`    ${style('muted', `... +${filtered.length - 10} more`)}\n`)
      }
    }

    function initialRender(): void {
      if (!process.stdout.isTTY) return
      process.stdout.write(`\n  ${styleBold('info', options.label)} _\n`)
      const visible = items.slice(0, 10)
      for (let i = 0; i < visible.length; i++) {
        const label = options.filter(visible[i])
        if (i === 0) {
          process.stdout.write(`  ${style('info', '❯')} ${styleBold('info', label)}\n`)
        } else {
          process.stdout.write(`    ${style('muted', label)}\n`)
        }
      }
      if (items.length > 10) {
        process.stdout.write(`    ${style('muted', `... +${items.length - 10} more`)}\n`)
      }
    }

    function cleanup(): void {
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(wasRaw ?? false) } catch { /* ignore */ }
      }
      rl.close()
    }

    initialRender()

    process.stdin.on('data', (buf: Buffer) => {
      const str = buf.toString('utf8')

      // Handle multi-byte escape sequences
      if (str === '\x1b[A' || str === '\x1bOA') {
        // Arrow up
        if (activeIndex > 0) activeIndex--
        render()
        return
      }
      if (str === '\x1b[B' || str === '\x1bOB') {
        // Arrow down
        if (activeIndex < filtered.length - 1) activeIndex++
        render()
        return
      }

      // Single character handling
      for (const ch of str) {
        const code = ch.charCodeAt(0)

        if (code === 13) {
          // Enter
          cleanup()
          if (filtered.length === 0 && items.length > 0) {
            resolve(items[0])
          } else if (filtered.length > 0) {
            resolve(filtered[activeIndex])
          } else {
            resolve(null)
          }
          return
        }

        if (code === 27) {
          // Escape
          cleanup()
          resolve(null)
          return
        }

        if (code === 3) {
          // Ctrl+C
          cleanup()
          resolve(null)
          return
        }

        if (code === 127 || code === 8) {
          // Backspace
          if (query.length > 0) {
            query = query.slice(0, -1)
            rank()
            render()
          }
          continue
        }

        // Printable character
        if (code >= 32 && code < 127) {
          query += ch
          activeIndex = 0
          rank()
          render()
        }
      }
    })

    rl.on('close', () => {
      // If still pending (e.g. stdin closed), resolve with first item
      resolve(filtered.length > 0 ? filtered[0] : items.length > 0 ? items[0] : null)
    })
  })
}

