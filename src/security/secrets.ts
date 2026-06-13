// ── Hardcoded secrets detection ───────────────────────────
// Scans source files for API keys, Bearer tokens, DB connection
// strings, PEM keys, and password assignments. Uses source-mask.ts
// for masking values in diagnostic messages.

import { maskSecrets } from '../utils/source-mask.js'
import type { Diagnostic, Severity, Suggestion } from '../types/index.js'

// ── Helper: build a diagnostic ──────────────────────────

function makeSecretDiagnostic(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  line: number,
  column: number,
  opts?: {
    fixable?: boolean
    suggestion?: Suggestion
    detail?: Record<string, unknown>
  }
): Diagnostic {
  return {
    filePath,
    engine: 'security-deep' as const,
    rule,
    severity,
    message,
    help,
    line,
    column,
    category: 'security' as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

// ── Helper: test-file detection ─────────────────────────

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) return true
  if (normalized.endsWith('.test.js') || normalized.endsWith('.spec.js')) return true
  if (normalized.endsWith('.test.py') || normalized.endsWith('.spec.py')) return true
  if (normalized.endsWith('.test.go')) return true
  if (normalized.endsWith('.rs') && normalized.includes('/tests/')) return true
  if (/\/__tests__\//.test(normalized)) return true
  if (/(?:^|\/)(?:test|tests|spec|specs)\//.test(normalized)) return true
  return false
}

// ── Secret pattern definitions ──────────────────────────

interface SecretPattern {
  name: string
  pattern: RegExp
  secretGroup: number
  help: string
  envVar: string
  secretType: string
}

const SECRET_PATTERNS: SecretPattern[] = [
  // OpenAI / generic API keys
  {
    name: 'API key',
    pattern: /['"`](sk-[A-Za-z0-9_-]{10,})['"`]/g,
    secretGroup: 1,
    help: 'Move API keys to environment variables or a secrets manager. Never commit secrets to source control.',
    envVar: 'SECRET_KEY',
    secretType: 'api-key',
  },
  // GitHub PATs
  {
    name: 'GitHub PAT',
    pattern: /['"`](ghp_[A-Za-z0-9]{36,})['"`]/g,
    secretGroup: 1,
    help: 'Move GitHub tokens to environment variables or a secrets manager.',
    envVar: 'GITHUB_TOKEN',
    secretType: 'api-key',
  },
  // GitHub OAuth tokens
  {
    name: 'GitHub OAuth token',
    pattern: /['"`](gho_[A-Za-z0-9]{36,})['"`]/g,
    secretGroup: 1,
    help: 'Move GitHub OAuth tokens to environment variables or a secrets manager.',
    envVar: 'GITHUB_OAUTH_TOKEN',
    secretType: 'token',
  },
  // GitHub fine-grained PATs
  {
    name: 'GitHub fine-grained PAT',
    pattern: /['"`](github_pat_[A-Za-z0-9_]{50,})['"`]/g,
    secretGroup: 1,
    help: 'Move GitHub fine-grained PATs to environment variables or a secrets manager.',
    envVar: 'GITHUB_TOKEN',
    secretType: 'api-key',
  },
  // AWS access keys
  {
    name: 'AWS access key',
    pattern: /['"`](AKIA[A-Z0-9]{12,})['"`]/g,
    secretGroup: 1,
    help: 'Move AWS credentials to environment variables, ~/.aws/credentials, or a secrets manager.',
    envVar: 'AWS_ACCESS_KEY_ID',
    secretType: 'aws-key',
  },
  // Google API keys
  {
    name: 'Google API key',
    pattern: /['"`](AIza[A-Za-z0-9_-]{20,})['"`]/g,
    secretGroup: 1,
    help: 'Move Google API keys to environment variables or a secrets manager.',
    envVar: 'GOOGLE_API_KEY',
    secretType: 'api-key',
  },
  // Generic key prefixes
  {
    name: 'API key',
    pattern: /['"`](key-[A-Za-z0-9_-]{10,})['"`]/g,
    secretGroup: 1,
    help: 'Move API keys to environment variables or a secrets manager. Never commit secrets to source control.',
    envVar: 'SECRET_KEY',
    secretType: 'api-key',
  },
  // Bearer tokens
  {
    name: 'Bearer token',
    pattern: /['"`](Bearer\s+[A-Za-z0-9_.-]{10,})['"`]/gi,
    secretGroup: 1,
    help: 'Move bearer tokens to environment variables or a secrets manager.',
    envVar: 'AUTH_TOKEN',
    secretType: 'token',
  },
  // GitHub personal access tokens (alternate prefix)
  {
    name: 'GitHub token',
    pattern: /['"`](ghpt_[A-Za-z0-9_-]{10,})['"`]/g,
    secretGroup: 1,
    help: 'Move GitHub tokens to environment variables or a secrets manager.',
    envVar: 'GITHUB_TOKEN',
    secretType: 'token',
  },
  // Password assignments
  {
    name: 'Password assignment',
    pattern: /(?:password|pwd|passwd|pass)\s*(?:=|:)\s*['"`]([^'"`]{4,})['"`]/gi,
    secretGroup: 1,
    help: 'Move passwords to environment variables or a secrets manager. Never commit credentials to source control.',
    envVar: 'PASSWORD',
    secretType: 'password',
  },
  // Secret/token assignments
  {
    name: 'Secret assignment',
    pattern: /(?:secret|token|apikey|api_key|access_key|private_key)\s*(?:=|:)\s*['"`]([^'"`]{4,})['"`]/gi,
    secretGroup: 1,
    help: 'Move secrets to environment variables or a secrets manager. Never commit secrets to source control.',
    envVar: 'SECRET',
    secretType: 'secret',
  },
  // DB connection strings
  {
    name: 'DB connection string',
    pattern: /['"`]((?:mongodb|postgres|postgresql|mysql|redis|amqp|amqps):\/\/[^'"`]{8,})['"`]/gi,
    secretGroup: 1,
    help: 'Move database connection strings to environment variables. Never commit credentials to source control.',
    envVar: 'DATABASE_URL',
    secretType: 'connection-string',
  },
  // PEM private keys
  {
    name: 'PEM private key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    secretGroup: 0,
    help: 'Move private keys to a secrets manager or secure file storage. Never commit private keys to source control.',
    envVar: 'PRIVATE_KEY_PATH',
    secretType: 'private-key',
  },
]

// ── Main detection function ─────────────────────────────

export function detectSecrets(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Skip test files entirely
  if (isTestFile(filePath)) return diagnostics

  for (const { num, text } of lines) {
    // Skip comment lines
    const trimmed = text.trim()
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue
    }

    for (const pattern of SECRET_PATTERNS) {
      pattern.pattern.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = pattern.pattern.exec(text)) !== null) {
        const secret = match[pattern.secretGroup]
        const col = match.index + 1

        // Use source-mask to redact the secret in the message
        const maskedValue = maskSecrets(secret || match[0])

        diagnostics.push(
          makeSecretDiagnostic(
            filePath,
            'security-deep/hardcoded-secret',
            'error',
            `Hardcoded ${pattern.name} detected: ${maskedValue}`,
            pattern.help,
            num,
            col,
            {
              fixable: true,
              suggestion: {
                type: 'replace' as const,
                text: `process.env.${pattern.envVar}`,
                confidence: 0.9,
                reason: 'Hardcoded secrets in source code are exposed in version control; use environment variables.',
              },
              detail: {
                secretType: pattern.secretType,
                secretPrefix: secret ? secret.slice(0, 4) : undefined,
                patternName: pattern.name,
              },
            }
          )
        )
      }
    }
  }

  return diagnostics
}

