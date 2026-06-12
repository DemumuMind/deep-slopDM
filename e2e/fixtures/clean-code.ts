// Clean, well-structured TypeScript code for E2E testing.
// This file should score 90+ on deep-slop.

export interface UserConfig {
  readonly apiUrl: string
  readonly timeoutMs: number
  readonly maxRetries: number
}

export interface ValidationResult {
  readonly isValid: boolean
  readonly errors: readonly string[]
}

const DEFAULT_CONFIG: UserConfig = {
  apiUrl: '',
  timeoutMs: 5000,
  maxRetries: 3,
}

export function createUserConfig(overrides: Partial<UserConfig> = {}): UserConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = []

  if (email.length === 0) {
    errors.push('Email cannot be empty')
  }

  if (!email.includes('@')) {
    errors.push('Email must contain @')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function processItems(items: readonly string[]): number {
  return items.filter((item) => item.length > 0).length
}

export function loadConfig(raw: string): UserConfig {
  try {
    const parsed = JSON.parse(raw)
    return createUserConfig(parsed)
  } catch (error) {
    throw new Error(`Failed to load config: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function calculateTotal(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0)
}

export function transformValue(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }
  if (typeof input === 'number') {
    return String(input)
  }
  return ''
}

export class ConfigManager {
  private config: UserConfig

  constructor(initial: UserConfig = createUserConfig()) {
    this.config = initial
  }

  getConfig(): UserConfig {
    return this.config
  }

  update(partial: Partial<UserConfig>): void {
    this.config = { ...this.config, ...partial }
  }
}
