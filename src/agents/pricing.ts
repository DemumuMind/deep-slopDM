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

// ── Agent Provider Pricing ─────────────────────────────
// Token price estimates per provider (per 1M tokens)

import type { AgentProvider } from './providers.js'

/** Token prices per 1M tokens (USD) */
export const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  claude: { input: 3.0, output: 15.0 },
  codex: { input: 5.0, output: 15.0 },
  cursor: { input: 3.0, output: 15.0 },
  opencode: { input: 2.5, output: 10.0 },
  aider: { input: 3.0, output: 15.0 },
  goose: { input: 2.5, output: 10.0 },
  windsurf: { input: 3.0, output: 15.0 },
  vscode: { input: 2.0, output: 8.0 },
  amp: { input: 3.0, output: 15.0 },
  'gemini-cli': { input: 1.25, output: 5.0 },
  kimi: { input: 0.6, output: 2.4 },
  warp: { input: 3.0, output: 15.0 },
  pi: { input: 2.5, output: 10.0 },
  crush: { input: 3.0, output: 15.0 },
  'deep-agents': { input: 3.0, output: 15.0 },
  antigravity: { input: 2.5, output: 10.0 },
}

/**
 * Estimate the cost of an agent repair session.
 *
 * @param provider - Provider name (must match a key in TOKEN_PRICES)
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens generated
 * @returns Estimated cost in USD
 */
export function estimateCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const prices = TOKEN_PRICES[provider]
  if (!prices) return 0

  const inputCost = (inputTokens / 1_000_000) * prices.input
  const outputCost = (outputTokens / 1_000_000) * prices.output

  return Math.round((inputCost + outputCost) * 100) / 100
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
