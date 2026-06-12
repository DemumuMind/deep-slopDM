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
