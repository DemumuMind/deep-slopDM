// ── HTML Report Charts ─────────────────────────────────
// Inline SVG chart generation for the deep-slop HTML trend report.

import type { HistoryRecord } from '../../history/store.js'
import { COLORS } from './helpers.js'

const SCORE_WIDTH = 800
const SCORE_HEIGHT = 240
const SEVERITY_WIDTH = 800
const SEVERITY_HEIGHT = 240

const SCORE_PADDING = { top: 10, right: 10, bottom: 24, left: 36 }
const SEVERITY_PADDING = { top: 10, right: 10, bottom: 24, left: 46 }

/** Build a smooth SVG path for a sparkline-style chart */
function scoreSparklinePath(records: HistoryRecord[], width: number, height: number): string {
  if (records.length === 0) return ''
  const chartW = width - SCORE_PADDING.left - SCORE_PADDING.right
  const chartH = height - SCORE_PADDING.top - SCORE_PADDING.bottom

  const scores = records.map((r) => r.score ?? 0)
  const points = scores.map((score, i) => {
    const x = SCORE_PADDING.left + (i / (records.length - 1)) * chartW
    const y = SCORE_PADDING.top + chartH - (score / 100) * chartH
    return [x, y] as const
  })

  if (points.length === 0) return ''

  const first = points[0]
  const last = points[points.length - 1]
  let path = `M ${first[0]},${first[1]}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i][0]},${points[i][1]}`
  }

  const areaPath = `${path} L ${last[0]},${SCORE_PADDING.top + chartH} L ${first[0]},${SCORE_PADDING.top + chartH} Z`
  return `${areaPath}|${path}`
}

/** Build a stacked area SVG for severity counts over time */
function severityStackedPath(records: HistoryRecord[], width: number, height: number): string {
  if (records.length === 0) return ''
  const chartW = width - SEVERITY_PADDING.left - SEVERITY_PADDING.right
  const chartH = height - SEVERITY_PADDING.top - SEVERITY_PADDING.bottom

  const maxTotal = Math.max(
    1,
    ...records.map((r) => r.errors + r.warnings + r.info + r.suggestions),
  )

  const layers = ['errors', 'warnings', 'info', 'suggestions'] as const
  const bottom = records.map((_, i) => SEVERITY_PADDING.left + (i / (records.length - 1)) * chartW)

  const buildLayer = (layer: typeof layers[number]) => {
    let prev: number[] = new Array(records.length).fill(0)
    const index = layers.indexOf(layer)
    for (let l = 0; l < index; l++) {
      const key = layers[l]
      prev = records.map((r, i) => prev[i] + r[key])
    }

    const top = records.map((r, i) => prev[i] + r[layer])
    const topPoints = top.map((v, i) => {
      return [bottom[i], SEVERITY_PADDING.top + chartH - (v / maxTotal) * chartH] as const
    })
    const bottomPoints = prev.map((v, i) => {
      return [bottom[i], SEVERITY_PADDING.top + chartH - (v / maxTotal) * chartH] as const
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

/** Build the score trend SVG chart */
export function buildScoreTrendChart(records: HistoryRecord[]): string {
  const scoreAreaPath = scoreSparklinePath(records, SCORE_WIDTH, SCORE_HEIGHT)
  const scoreArea = scoreAreaPath.split('|')[0] ?? ''
  const scoreLine = scoreAreaPath.split('|')[1] ?? ''

  const padding = SCORE_PADDING
  const chartW = SCORE_WIDTH - padding.left - padding.right
  const chartH = SCORE_HEIGHT - padding.top - padding.bottom

  const dots = records.map((r, i) => {
    const x = padding.left + (i / (records.length - 1 || 1)) * chartW
    const y = padding.top + chartH - ((r.score ?? 0) / 100) * chartH
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="4" />`
  }).join('')

  return `<div class="chart">
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
      ${dots}
    </svg>
  </div>`
}

/** Build the severity breakdown SVG chart */
export function buildSeverityBreakdownChart(records: HistoryRecord[]): string {
  return `<div class="chart">
    <svg viewBox="0 0 800 240" preserveAspectRatio="none">
      <rect x="46" y="10" width="744" height="206" fill="none" />
      <line class="axis" x1="46" y1="216" x2="790" y2="216" />
      <line class="axis" x1="46" y1="10" x2="46" y2="216" />
      <text class="chart-label" x="46" y="235">oldest</text>
      <text class="chart-label" x="750" y="235">latest</text>
      ${severityStackedPath(records, SEVERITY_WIDTH, SEVERITY_HEIGHT)}
    </svg>
  </div>`
}

/** Build the severity legend */
export function buildSeverityLegend(): string {
  return `<div class="legend">
    <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.error}"></span> Errors</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.warning}"></span> Warnings</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.info}"></span> Info</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${COLORS.suggestion}"></span> Suggestions</span>
  </div>`
}
