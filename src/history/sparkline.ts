// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: number[], width?: number): string {
  if (values.length === 0) return ''

  const targetWidth = width ?? values.length

  // Sample or pad values to target width
  let sampled: number[]
  if (values.length <= targetWidth) {
    // Pad left with zeros if fewer values than width
    const pad = targetWidth - values.length
    sampled = [...Array(pad).fill(0), ...values]
  } else {
    // Downsample: pick evenly spaced values
    sampled = []
    for (let i = 0; i < targetWidth; i++) {
      const idx = Math.floor((i * values.length) / targetWidth)
      sampled.push(values[idx])
    }
  }

  return sampled.map((v) => {
    const clamped = Math.max(0, Math.min(100, v))
    const idx = Math.min(Math.floor((clamped / 100) * BLOCKS.length), BLOCKS.length - 1)
    return BLOCKS[idx]
  }).join('')
}

export function deltaText(current: number, previous: number | null): string {
  if (previous === null) return '—'
  const diff = current - previous
  if (diff > 0) return `+${diff} ▲`
  if (diff < 0) return `${diff} ▼`
  return '0 ─'
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
