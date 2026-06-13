// ── Source Masking Utility ─────────────────────────────
// Redacts secrets and sensitive data from diagnostic messages
// before they are displayed in terminal output or SARIF.

/** Pattern matchers for sensitive data */
const SENSITIVE_PATTERNS: Array<{
  pattern: RegExp
  replacement: string
  label: string
}> = [
  // API keys (common prefixes)
  {
    pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    replacement: '[REDACTED-KEY]',
    label: 'API key',
  },
  {
    pattern: /\b(ghp_[a-zA-Z0-9]{36,})\b/g,
    replacement: '[REDACTED-TOKEN]',
    label: 'GitHub PAT',
  },
  {
    pattern: /\b(gho_[a-zA-Z0-9]{36,})\b/g,
    replacement: '[REDACTED-TOKEN]',
    label: 'GitHub OAuth',
  },
  {
    pattern: /\b(AKIA[A-Z0-9]{16})\b/g,
    replacement: '[REDACTED-KEY]',
    label: 'AWS access key',
  },
  // Bearer tokens
  {
    pattern: /\b(Bearer\s+)[a-zA-Z0-9\-_.]{20,}/gi,
    replacement: '$1[REDACTED]',
    label: 'Bearer token',
  },
  // URL credentials (https://user:pass@host)
  {
    pattern: /:\/\/([^:]+):([^@]+)@/g,
    replacement: '://[REDACTED]:[REDACTED]@',
    label: 'URL credentials',
  },
  // Password assignments
  {
    pattern: /\b(password|pwd|passwd|secret|token|apikey|api_key)\s*[:=]\s*["'][^"']{4,}["']/gi,
    replacement: '$1=[REDACTED]',
    label: 'Password/secret assignment',
  },
  // Connection strings with passwords
  {
    pattern: /\b(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi,
    replacement: '$1://[REDACTED]:[REDACTED]@',
    label: 'DB connection string',
  },
  // Private keys (PEM header)
  {
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    replacement: '[REDACTED-PRIVATE-KEY]',
    label: 'Private key',
  },
]

/** Redact sensitive data from a string */
export function maskSecrets(text: string): string {
  let result = text
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/** Count how many secrets were redacted */
export function countMaskedSecrets(original: string, masked: string): number {
  let count = 0
  const redactedRe = /\[REDACTED[^\]]*\]/g
  const matches = masked.match(redactedRe)
  if (matches) count = matches.length
  return count
}

