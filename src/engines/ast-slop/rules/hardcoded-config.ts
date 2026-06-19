// ── Hardcoded Config Rule ──────────────────────────────────────────────
// Detects URLs, ports, and API endpoints hardcoded outside of config files.

import type { Diagnostic, Language, Suggestion } from '../../../types/index.js'
import { diag } from '../shared.js'

const STATIC_URL_PATTERNS = [
  /^https?:\/\/github\.com\/DemumuMind\/deep-slopDM\b/i,
  /^https?:\/\/registry\.npmjs\.org\b/i,
  /^https?:\/\/img\.shields\.io\b/i,
  /^https?:\/\/raw\.githubusercontent\.com\b/i,
  /^https?:\/\/.*sarif/i,
  /^https?:\/\/telemetry\.deep-slop\.dev\b/i,
  /^https?:\/\/github\.com\/\$\{.*\}/i,
]

function isStaticProjectUrl(url: string): boolean {
  return STATIC_URL_PATTERNS.some(pattern => pattern.test(url))
}

function buildHardcodedConfigSuggestion(
  lineText: string,
  urlMatch: RegExpMatchArray | null,
  portMatch: RegExpMatchArray | null,
  lineNum: number,
): Suggestion | undefined {
  if (urlMatch) {
    const replacement = `process.env.API_URL ?? ${urlMatch[0]}`
    const fixedLine = lineText.replace(urlMatch[0], replacement)
    return {
      type: 'replace',
      text: fixedLine,
      range: {
        startLine: lineNum,
        startCol: 1,
        endLine: lineNum,
        endCol: lineText.length + 1,
      },
      confidence: 0.7,
      reason: 'Externalize the hardcoded URL to an environment variable so it can be changed per environment.',
    }
  }

  if (portMatch) {
    const port = portMatch[1]
    const portRe = new RegExp(`\\b${port}\\b`)
    const fixedLine = lineText.replace(portRe, `Number(process.env.PORT ?? '${port}')`)
    return {
      type: 'replace',
      text: fixedLine,
      range: {
        startLine: lineNum,
        startCol: 1,
        endLine: lineNum,
        endCol: lineText.length + 1,
      },
      confidence: 0.7,
      reason: 'Externalize the hardcoded port to an environment variable so it can be changed per environment.',
    }
  }

  return undefined
}

export function detectHardcodedConfig(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  if (/[/\\](?:config|conf|settings|env)[/\\]/i.test(filePath)) return results
  if (/[/\\]\.env/i.test(filePath)) return results

  const urlRe = /['"`]((?:https?:\/\/)[^'"`\s]+)['"`]/
  const portRe = /:(\d{4,5})\b/

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') ||
        /^\s*import\b/.test(trimmed)) continue

    const urlMatch = trimmed.match(urlRe)
    if (urlMatch) {
      const url = urlMatch[1]
      if (url.includes('${')) continue
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com|example\.org/i.test(url)) continue
      if (/\.test\.|\.spec\.|__tests__|test-utils/i.test(filePath)) continue
      if (isStaticProjectUrl(url)) continue

      const col = text.indexOf(urlMatch[0]) + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/hardcoded-config',
          severity: 'warning',
          message: `Hardcoded URL: "${url}" — should be in config/environment`,
          help: 'Move URLs to environment variables or a config file. Hardcoded URLs make deployment across environments error-prone.',
          line: num,
          column: col,
          fixable: true,
          suggestion: buildHardcodedConfigSuggestion(text, urlMatch, null, num),
          detail: { url },
        }),
      )
    }

    const portMatch = trimmed.match(portRe)
    if (portMatch) {
      const port = portMatch[1]
      if (/\bcase\s+\d+:/i.test(trimmed)) continue
      if (/\bport\b/i.test(trimmed) && !/process\.env/.test(trimmed)) {
        const col = text.indexOf(portMatch[0]) + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/hardcoded-config',
            severity: 'info',
            message: `Hardcoded port: ${port} — should be in config/environment`,
            help: 'Move port numbers to environment variables or a config file. Hardcoded ports make deployment across environments error-prone.',
            line: num,
            column: col,
            fixable: true,
            suggestion: buildHardcodedConfigSuggestion(text, null, portMatch, num),
            detail: { port },
          }),
        )
      }
    }
  }
  return results
}
