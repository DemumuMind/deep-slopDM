// ── Agent Provider Pricing ─────────────────────────────
// Token price estimates per provider (per 1M tokens)

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

