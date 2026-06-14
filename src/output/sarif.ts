// ── SARIF 2.1.0 Output Generator ────────────────────────
// Produces valid SARIF JSON for integration with GitHub Code Scanning,
// VS Code SARIF Viewer, and other SARIF consumers.

import type { ScanResult, Severity, Diagnostic } from '../types/index.js'
import { APP_VERSION } from '../version.js'

/** SARIF severity mapping: error→error, warning→warning, info→note, suggestion→note */
function mapSeverity(sev: Severity): 'error' | 'warning' | 'note' {
  switch (sev) {
    case 'error': return 'error'
    case 'warning': return 'warning'
    case 'info':
    case 'suggestion':
      return 'note'
  }
}

/** Build SARIF rule descriptors from unique rules in diagnostics */
function buildRules(diagnostics: Diagnostic[]): SarifRuleDescriptor[] {
  const seen = new Map<string, Diagnostic>()
  for (const d of diagnostics) {
    if (!seen.has(d.rule)) {
      seen.set(d.rule, d)
    }
  }
  return Array.from(seen.entries()).map(([id, d]) => ({
    id,
    name: id,
    shortDescription: { text: d.message },
    fullDescription: { text: d.help },
    helpUri: `https://github.com/DemumuMind/deep-slopDM/blob/main/docs/rules/${id}.md`,
    properties: {
      category: d.category,
      severity: d.severity,
      fixable: d.fixable,
    },
  }))
}

/** Build SARIF result objects from diagnostics */
function buildResults(diagnostics: Diagnostic[]): SarifResult[] {
  return diagnostics.map((d) => {
    const result: SarifResult = {
      ruleId: d.rule,
      level: mapSeverity(d.severity),
      message: { text: d.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: d.filePath },
            region: {
              startLine: d.line,
              startColumn: d.column,
            },
          },
        },
      ],
    }

    if (d.help) {
      result.properties = { help: d.help }
    }

    if (d.fixable) {
      result.properties = { ...result.properties, fixable: true }
    }

    if (d.suggestion) {
      result.fixes = [
        {
          description: { text: d.suggestion.reason },
          artifactChanges: [
            {
              artifactLocation: { uri: d.filePath },
              replacements: [
                {
                  deletedRegion: d.suggestion.range
                    ? {
                        startLine: d.suggestion.range.startLine,
                        startColumn: d.suggestion.range.startCol,
                        endLine: d.suggestion.range.endLine,
                        endColumn: d.suggestion.range.endCol,
                      }
                    : {
                        startLine: d.line,
                        startColumn: d.column,
                        endLine: d.line,
                        endColumn: d.column + 1,
                      },
                  insertedContent: { text: d.suggestion.text },
                },
              ],
            },
          ],
        },
      ]
    }

    return result
  })
}

/**
 * Generate a valid SARIF 2.1.0 log from a ScanResult.
 */
export function generateSarif(result: ScanResult): object {
  const allDiags = result.engines.flatMap((e) => e.diagnostics)

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'deep-slop',
            version: APP_VERSION,
            informationUri: 'https://github.com/DemumuMind/deep-slopDM',
            rules: buildRules(allDiags),
          },
        },
        results: buildResults(allDiags),
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: new Date(Date.now() - result.meta.elapsed).toISOString(),
            endTimeUtc: new Date().toISOString(),
            toolExecutionNotifications: result.engines
              .filter((e) => e.skipped)
              .map((e) => ({
                descriptor: { id: `skip/${e.engine}` },
                level: 'note' as const,
                message: { text: e.skipReason ?? 'Engine skipped' },
              })),
          },
        ],
        properties: {
          score: result.scoreable === false ? null : result.score,
          scoreable: result.scoreable,
          totalDiagnostics: result.totalDiagnostics,
          bySeverity: result.bySeverity,
          byEngine: result.byEngine,
          meta: result.meta,
        },
      },
    ],
  }
}

// ── Internal SARIF shape types ──────────────────────────

interface SarifRuleDescriptor {
  id: string
  name: string
  shortDescription: { text: string }
  fullDescription: { text: string }
  helpUri: string
  properties: Record<string, unknown>
}

interface SarifResult {
  ruleId: string
  level: 'error' | 'warning' | 'note'
  message: { text: string }
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string }
      region: { startLine: number; startColumn: number }
    }
  }>
  properties?: Record<string, unknown>
  fixes?: Array<{
    description: { text: string }
    artifactChanges: Array<{
      artifactLocation: { uri: string }
      replacements: Array<{
        deletedRegion: { startLine: number; startColumn: number; endLine: number; endColumn: number }
        insertedContent: { text: string }
      }>
    }>
  }>
}

