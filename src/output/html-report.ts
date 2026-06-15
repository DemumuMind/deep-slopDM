// ── HTML Trend Report Generator ─────────────────────────
// Produces a self-contained, dark-themed HTML report with inline SVG
// charts from deep-slop scan history records.

import type { HistoryRecord } from '../history/store.js'
import { APP_VERSION } from '../version.js'

/** Options for the HTML report generator */
export interface HtmlReportOptions {
  /** Page title shown in the report header */
  title?: string
  /** Target root directory (used for display only) */
  rootDir?: string
}

const COLORS = {
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
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Format a number of milliseconds as human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

/** Format an ISO timestamp for display */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Score label color based on the deep-slop thresholds */
function scoreClass(score: number): string {
  if (score >= 75) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

/** Score label text */
function scoreLabel(score: number): string {
  if (score >= 75) return 'Healthy'
  if (score >= 50) return 'Needs Work'
  return 'Critical'
}

/** Compute a delta label (+3, -2, 0) */
function deltaLabel(current: number, previous: number | null): string {
  if (previous === null) return '—'
  const diff = current - previous
  if (diff > 0) return `+${diff}`
  if (diff < 0) return `${diff}`
  return '0'
}

/** Build a smooth SVG path for a sparkline-style chart */
function scoreSparklinePath(records: HistoryRecord[], width: number, height: number): string {
  if (records.length === 0) return ''
  const padding = { top: 10, right: 10, bottom: 24, left: 36 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const scores = records.map((r) => r.score ?? 0)
  const minScore = 0
  const maxScore = 100

  const points = scores.map((score, i) => {
    const x = padding.left + (i / (records.length - 1)) * chartW
    const y = padding.top + chartH - ((score - minScore) / (maxScore - minScore)) * chartH
    return [x, y] as const
  })

  if (points.length === 0) return ''

  const first = points[0]
  const last = points[points.length - 1]
  let path = `M ${first[0]},${first[1]}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i][0]},${points[i][1]}`
  }

  const areaPath = `${path} L ${last[0]},${padding.top + chartH} L ${first[0]},${padding.top + chartH} Z`
  return `${areaPath}|${path}`
}

/** Build a stacked area SVG for severity counts over time */
function severityStackedPath(records: HistoryRecord[], width: number, height: number): string {
  if (records.length === 0) return ''
  const padding = { top: 10, right: 10, bottom: 24, left: 46 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxTotal = Math.max(
    1,
    ...records.map((r) => r.errors + r.warnings + r.info + r.suggestions),
  )

  const layers = ['errors', 'warnings', 'info', 'suggestions'] as const
  const bottom = records.map((_, i) => {
    const x = padding.left + (i / (records.length - 1)) * chartW
    return x
  })

  const buildLayer = (layer: typeof layers[number]) => {
    let prev: number[] = new Array(records.length).fill(0)
    const index = layers.indexOf(layer)
    for (let l = 0; l < index; l++) {
      const key = layers[l]
      prev = records.map((r, i) => prev[i] + r[key])
    }

    const top = records.map((r, i) => prev[i] + r[layer])
    const topPoints = top.map((v, i) => {
      const x = bottom[i]
      const y = padding.top + chartH - (v / maxTotal) * chartH
      return [x, y] as const
    })
    const bottomPoints = prev.map((v, i) => {
      const x = bottom[i]
      const y = padding.top + chartH - (v / maxTotal) * chartH
      return [x, y] as const
    })

    const forward = topPoints.map((p) => `${p[0]},${p[1]}`).join(' ')
    const backward = bottomPoints.reverse().map((p) => `${p[0]},${p[1]}`).join(' ')
    return `M ${bottomPoints[bottomPoints.length - 1][0]},${bottomPoints[bottomPoints.length - 1][1]} L ${forward} L ${bottomPoints[0][0]},${bottomPoints[0][1]} L ${backward} Z`
  }

  return layers
    .map((layer) => {
      const color = layer === 'errors'
        ? COLORS.error
        : layer === 'warnings'
          ? COLORS.warning
          : layer === 'info'
            ? COLORS.info
            : COLORS.suggestion
      return `<path d="${buildLayer(layer)}" fill="${color}" opacity="0.8" />`
    })
    .join('')
}

/** Build a <tbody> of recent scans */
function historyTableRows(records: HistoryRecord[]): string {
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
function engineTableRows(records: HistoryRecord[]): string {
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

/** Generate a complete HTML trend report string */
export function generateHTMLReport(history: HistoryRecord[], options?: HtmlReportOptions): string {
  const records = history.slice()
  const title = escapeHtml(options?.title ?? 'deep-slop Trend Report')
  const rootDir = escapeHtml(options?.rootDir ?? '.')

  const latest = records[records.length - 1]
  const previous = records.length >= 2 ? records[records.length - 2] : null
  const latestScore = latest ? (latest.score ?? 0) : 0
  const previousScore = previous ? (previous.score ?? 0) : null
  const delta = latest ? deltaLabel(latestScore, previousScore) : '—'
  const totalScans = records.length
  const avgScore = totalScans > 0
    ? Math.round(records.reduce((sum, r) => sum + (r.score ?? 0), 0) / totalScans)
    : 0
  const totalIssues = records.reduce((sum, r) => sum + r.errors + r.warnings + r.info + r.suggestions, 0)
  const avgDuration = totalScans > 0
    ? Math.round(records.reduce((sum, r) => sum + r.durationMs, 0) / totalScans)
    : 0

  const scoreAreaPath = scoreSparklinePath(records, 800, 240)
  const scoreArea = scoreAreaPath.split('|')[0] ?? ''
  const scoreLine = scoreAreaPath.split('|')[1] ?? ''

  const latestClass = scoreClass(latestScore)
  const deltaClass = latest
    ? latestScore > (previousScore ?? latestScore)
      ? 'success'
      : latestScore < (previousScore ?? latestScore)
        ? 'danger'
        : 'muted'
    : 'muted'

  const totalIssuesBySeverity = records.reduce(
    (acc, r) => {
      acc.errors += r.errors
      acc.warnings += r.warnings
      acc.info += r.info
      acc.suggestions += r.suggestions
      return acc
    },
    { errors: 0, warnings: 0, info: 0, suggestions: 0 },
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
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
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <p>${totalScans} scan${totalScans === 1 ? '' : 's'} &bull; ${rootDir} &bull; Generated by deep-slop v${APP_VERSION}</p>
    </header>

    ${totalScans === 0 ? '<div class="card empty-state"><h2>No history available</h2><p>Run <code>deep-slop scan</code> to collect trend data.</p></div>' : `
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
    </section>

    <section class="grid cols-2">
      <div class="card">
        <h2>Score Trend</h2>
        <div class="chart">
          <svg viewBox="0 0 800 240" preserveAspectRatio="none">
            <rect x="46" y="10" width="744" height="206" fill="none" />
            <line class="grid-line" x1="46" y1="10" x2="790" y2="10" />
            <line class="grid-line" x1="46" y1="62" x2="790" y2="62" />
            <line class="grid-line" x1="46" y1="114" x2="790" y2="114" />
            <line class="grid-line" x1="46" y1="166" x2="790" y2="166" />
            <line class="grid-line" x1="46" y1="216" x2="790" y2="216" />
            <line class="axis" x1="46" y1="216" x2="790" y2="216" />
            <line class="axis" x1="46" y1="10" x2="46" y2="216" />
            <text class="chart-label" x="10" y="15">100</text>
            <text class="chart-label" x="18" y="67">75</text>
            <text class="chart-label" x="18" y="119">50</text>
            <text class="chart-label" x="18" y="171">25</text>
            <text class="chart-label" x="22" y="221">0</text>
            <text class="chart-label" x="46" y="235">oldest</text>
            <text class="chart-label" x="750" y="235">latest</text>
            ${scoreArea ? `<path class="chart-area" d="${scoreArea}" />` : ''}
            ${scoreLine ? `<path class="chart-line" d="${scoreLine}" />` : ''}
            ${records.map((r, i) => {
              const padding = { top: 10, right: 10, bottom: 24, left: 36 }
              const chartW = 800 - padding.left - padding.right
              const chartH = 240 - padding.top - padding.bottom
              const x = padding.left + (i / (records.length - 1 || 1)) * chartW
              const y = padding.top + chartH - ((r.score ?? 0) / 100) * chartH
              return `<circle class="chart-dot" cx="${x}" cy="${y}" r="4" />`
            }).join('')}
          </svg>
        </div>
      </div>

      <div class="card">
        <h2>Severity Breakdown</h2>
        <div class="chart">
          <svg viewBox="0 0 800 240" preserveAspectRatio="none">
            <rect x="46" y="10" width="744" height="206" fill="none" />
            <line class="axis" x1="46" y1="216" x2="790" y2="216" />
            <line class="axis" x1="46" y1="10" x2="46" y2="216" />
            <text class="chart-label" x="46" y="235">oldest</text>
            <text class="chart-label" x="750" y="235">latest</text>
            ${severityStackedPath(records, 800, 240)}
          </svg>
        </div>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.error}"></span> Errors</span>
          <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.warning}"></span> Warnings</span>
          <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.info}"></span> Info</span>
          <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.suggestion}"></span> Suggestions</span>
        </div>
      </div>
    </section>

    <section class="grid cols-2">
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
      </div>

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
      </div>
    </section>

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
    </section>

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
    </section>
    `}

    <footer>
      Generated by <strong>deep-slop v${APP_VERSION}</strong> &bull; ${new Date().toLocaleString('en-US')}
    </footer>
  </div>
</body>
</html>`
}
