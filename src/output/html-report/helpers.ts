// ── HTML Report Helpers ─────────────────────────────────
// Utility functions, styling, and table generation for the
// deep-slop HTML trend report.

import type { HistoryRecord } from '../../history/store.js'

/** Options for the HTML report generator */
export interface HtmlReportOptions {
  /** Page title shown in the report header */
  title?: string
  /** Target root directory (used for display only) */
  rootDir?: string
}

export const COLORS = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  muted: '#8b949e',
  error: '#f85149',
  warning: '#f0883e',
  info: '#58a6ff',
  suggestion: '#39c0ed',
  success: '#3fb950',
  accent: '#a371f7',
}

/** Escape special HTML characters in a string */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Format a number of milliseconds as human-readable duration */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

/** Format an ISO timestamp for display */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Score label color based on the deep-slop thresholds */
export function scoreClass(score: number): string {
  if (score >= 75) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

/** Score label text */
export function scoreLabel(score: number): string {
  if (score >= 75) return 'Healthy'
  if (score >= 50) return 'Needs Work'
  return 'Critical'
}

/** Compute a delta label (+3, -2, 0) */
export function deltaLabel(current: number, previous: number | null): string {
  if (previous === null) return '—'
  const diff = current - previous
  if (diff > 0) return `+${diff}`
  if (diff < 0) return `${diff}`
  return '0'
}

/** Build a <tbody> of recent scans */
export function historyTableRows(records: HistoryRecord[]): string {
  const reversed = [...records].reverse()
  return reversed
    .map((r) => {
      const score = r.score ?? 0
      const cls = scoreClass(score)
      return `<tr>
        <td>${escapeHtml(formatDate(r.timestamp))}</td>
        <td class="${cls}">${score}</td>
        <td>${r.errors}</td>
        <td>${r.warnings}</td>
        <td>${r.info}</td>
        <td>${r.suggestions}</td>
        <td>${r.filesScanned}</td>
        <td>${escapeHtml(formatDuration(r.durationMs))}</td>
      </tr>`
    })
    .join('')
}

/** Build engine usage / performance table rows */
export function engineTableRows(records: HistoryRecord[]): string {
  const engineStats = new Map<string, { count: number, totalDuration: number, totalIssues: number }>()
  for (const r of records) {
    const totalIssues = r.errors + r.warnings + r.info + r.suggestions
    for (const name of r.engines) {
      const current = engineStats.get(name) ?? { count: 0, totalDuration: 0, totalIssues: 0 }
      current.count++
      current.totalDuration += r.durationMs
      current.totalIssues += totalIssues
      engineStats.set(name, current)
    }
  }

  const rows = Array.from(engineStats.entries())
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([name, stats]) => {
      const avgDuration = Math.round(stats.totalDuration / stats.count)
      const avgIssues = Math.round(stats.totalIssues / stats.count)
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${stats.count}</td>
        <td>${escapeHtml(formatDuration(avgDuration))}</td>
        <td>${avgIssues}</td>
      </tr>`
    })
    .join('')

  return rows || `<tr><td colspan="4" class="muted">No engine data available</td></tr>`
}

/** Build the shared CSS block for the report */
export function buildReportStyles(): string {
  return `<style>
    :root {
      --bg: ${COLORS.bg};
      --surface: ${COLORS.surface};
      --border: ${COLORS.border};
      --text: ${COLORS.text};
      --muted: ${COLORS.muted};
      --error: ${COLORS.error};
      --warning: ${COLORS.warning};
      --info: ${COLORS.info};
      --suggestion: ${COLORS.suggestion};
      --success: ${COLORS.success};
      --accent: ${COLORS.accent};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    header h1 {
      margin: 0 0 8px;
      font-size: 2rem;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .grid {
      display: grid;
      gap: 24px;
      margin-bottom: 32px;
    }
    .grid.cols-3 {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .grid.cols-2 {
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .card h2 {
      margin: 0 0 16px;
      font-size: 1.1rem;
      color: var(--text);
      font-weight: 600;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stat-value {
      font-size: 2.4rem;
      font-weight: 700;
      line-height: 1;
    }
    .stat-label {
      font-size: 0.85rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-delta {
      font-size: 0.95rem;
      font-weight: 600;
    }
    .danger { color: var(--error); }
    .warning { color: var(--warning); }
    .success { color: var(--success); }
    .info { color: var(--info); }
    .muted { color: var(--muted); }
    .chart {
      width: 100%;
      height: 240px;
      overflow: hidden;
    }
    .chart svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .axis {
      stroke: var(--border);
      stroke-width: 1;
    }
    .grid-line {
      stroke: var(--border);
      stroke-width: 1;
      stroke-dasharray: 4 4;
      opacity: 0.5;
    }
    .chart-label {
      fill: var(--muted);
      font-size: 11px;
    }
    .chart-line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .chart-area {
      fill: var(--accent);
      opacity: 0.15;
    }
    .chart-dot {
      fill: var(--accent);
      stroke: var(--surface);
      stroke-width: 2;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 12px;
      font-size: 0.85rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
    }
    .legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      font-variant-numeric: tabular-nums;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .severity-row td {
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(255,255,255,0.1);
    }
    .badge.errors { background: rgba(248,81,73,0.15); color: var(--error); }
    .badge.warnings { background: rgba(240,136,62,0.15); color: var(--warning); }
    .badge.info { background: rgba(88,166,255,0.15); color: var(--info); }
    .badge.suggestions { background: rgba(57,192,237,0.15); color: var(--suggestion); }
    .empty-state {
      text-align: center;
      color: var(--muted);
      padding: 48px 24px;
    }
    footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.85rem;
      text-align: center;
    }
    @media (max-width: 600px) {
      .container { padding: 20px 16px; }
      header h1 { font-size: 1.5rem; }
      .stat-value { font-size: 1.8rem; }
      th, td { padding: 10px 8px; font-size: 0.85rem; }
    }
  </style>`
}

// ── Report section builders ───────────────────────────────

/** Build the top summary card grid */
export function buildSummaryCards(
  latestScore: number,
  previousScore: number | null,
  avgScore: number,
  totalScans: number,
  totalIssues: number,
  latestClass: string,
  deltaClass: string,
  delta: string,
  previous: HistoryRecord | null,
): string {
  return `
    <section class="grid cols-3">
      <div class="card">
        <div class="stat">
          <span class="stat-value ${latestClass}">${latestScore}</span>
          <span class="stat-label">Latest Score</span>
          <span class="stat-delta ${deltaClass}">Δ ${delta} ${previous ? 'from previous' : ''}</span>
        </div>
      </div>
      <div class="card">
        <div class="stat">
          <span class="stat-value">${avgScore}</span>
          <span class="stat-label">Average Score</span>
          <span class="stat-delta muted">${scoreLabel(avgScore)}</span>
        </div>
      </div>
      <div class="card">
        <div class="stat">
          <span class="stat-value">${totalScans}</span>
          <span class="stat-label">Total Scans</span>
          <span class="stat-delta muted">${totalIssues} issues total</span>
        </div>
      </div>
    </section>`
}

/** Build the issue totals table */
export function buildIssueTotals(
  totalIssuesBySeverity: { errors: number, warnings: number, info: number, suggestions: number },
  totalIssues: number,
  totalScans: number,
): string {
  return `
    <div class="card">
      <h2>Issue Totals</h2>
      <table>
        <tr>
          <th>Severity</th>
          <th>Total</th>
          <th>Avg / Scan</th>
        </tr>
        <tr>
          <td><span class="badge errors">errors</span></td>
          <td>${totalIssuesBySeverity.errors}</td>
          <td>${totalScans > 0 ? Math.round(totalIssuesBySeverity.errors / totalScans) : 0}</td>
        </tr>
        <tr>
          <td><span class="badge warnings">warnings</span></td>
          <td>${totalIssuesBySeverity.warnings}</td>
          <td>${totalScans > 0 ? Math.round(totalIssuesBySeverity.warnings / totalScans) : 0}</td>
        </tr>
        <tr>
          <td><span class="badge info">info</span></td>
          <td>${totalIssuesBySeverity.info}</td>
          <td>${totalScans > 0 ? Math.round(totalIssuesBySeverity.info / totalScans) : 0}</td>
        </tr>
        <tr>
          <td><span class="badge suggestions">suggestions</span></td>
          <td>${totalIssuesBySeverity.suggestions}</td>
          <td>${totalScans > 0 ? Math.round(totalIssuesBySeverity.suggestions / totalScans) : 0}</td>
        </tr>
        <tr>
          <td><strong>Total</strong></td>
          <td><strong>${totalIssues}</strong></td>
          <td><strong>${totalScans > 0 ? Math.round(totalIssues / totalScans) : 0}</strong></td>
        </tr>
      </table>
    </div>`
}

/** Build the performance table */
export function buildPerformance(avgDuration: number, records: HistoryRecord[]): string {
  return `
    <div class="card">
      <h2>Performance</h2>
      <div class="stat" style="margin-bottom: 16px;">
        <span class="stat-value info">${escapeHtml(formatDuration(avgDuration))}</span>
        <span class="stat-label">Average Scan Duration</span>
      </div>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Fastest scan</td>
          <td>${escapeHtml(formatDuration(records.length > 0 ? Math.min(...records.map((r) => r.durationMs)) : 0))}</td>
        </tr>
        <tr>
          <td>Slowest scan</td>
          <td>${escapeHtml(formatDuration(records.length > 0 ? Math.max(...records.map((r) => r.durationMs)) : 0))}</td>
        </tr>
        <tr>
          <td>Average files scanned</td>
          <td>${records.length > 0 ? Math.round(records.reduce((s, r) => s + r.filesScanned, 0) / records.length) : 0}</td>
        </tr>
      </table>
    </div>`
}

/** Build the engine usage table */
export function buildEngineUsage(records: HistoryRecord[]): string {
  return `
    <section class="card">
      <h2>Engine Usage</h2>
      <table>
        <tr>
          <th>Engine</th>
          <th>Scans Used</th>
          <th>Avg Duration</th>
          <th>Avg Issues</th>
        </tr>
        ${engineTableRows(records)}
      </table>
    </section>`
}

/** Build the recent scans table */
export function buildRecentScans(records: HistoryRecord[]): string {
  return `
    <section class="card">
      <h2>Recent Scans</h2>
      <div style="overflow-x: auto;">
        <table>
          <tr>
            <th>When</th>
            <th>Score</th>
            <th>Errors</th>
            <th>Warnings</th>
            <th>Info</th>
            <th>Suggestions</th>
            <th>Files</th>
            <th>Duration</th>
          </tr>
          ${historyTableRows(records)}
        </table>
      </div>
    </section>`
}
