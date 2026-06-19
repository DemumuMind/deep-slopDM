// ── Pattern documentation with bad/good examples ────────────
// Used by `deep-slop rules --examples` and MCP tool `deep_slop_patterns`

export interface PatternDoc {
  name: string
  rule: string
  category: string
  description: string
  bad: string
  good: string
  fixGuidance: string
}

export const PATTERN_DOCS: PatternDoc[] = [
  {
    name: 'Empty Catch Block',
    rule: 'ast-slop/empty-catch',
    category: 'Error Handling',
    description: 'Catch blocks that silently swallow exceptions without handling or logging them.',
    bad: `try {
  await saveUser(user)
} catch {
  // silently ignored
}`,
    good: `try {
  await saveUser(user)
} catch (error) {
  logger.error('Failed to save user', { userId: user.id, error })
  throw new AppError('User save failed', { cause: error })
}`,
    fixGuidance: 'Log the error and either re-throw, handle, or explicitly document why it is safe to ignore.',
  },
  {
    name: 'Narrative Comment',
    rule: 'ast-slop/narrative-comment',
    category: 'Code Clarity',
    description: 'Comments that describe what the code does step-by-step instead of why.',
    bad: `// First we get the user from the database
// Then we check if the user exists
// If not, we throw an error
// Otherwise we return the user
function getUser(id: string) {
  const user = db.find(id)
  if (!user) throw new NotFoundError()
  return user
}`,
    good: `function getUser(id: string) {
  const user = db.find(id)
  if (!user) throw new NotFoundError()
  return user
}`,
    fixGuidance: 'Remove narrative comments. If code needs explanation, rename variables/functions. Add comments only for WHY, not WHAT.',
  },
  {
    name: 'Unsafe Type Assertion',
    rule: 'ast-slop/as-any',
    category: 'Type Safety',
    description: 'Using `as any` to bypass TypeScript type checking.',
    bad: `const data = response.json() as any
const name = data.userName`,
    good: `interface UserResponse {
  userName: string
  userId: number
}
const data: UserResponse = response.json()
const name = data.userName`,
    fixGuidance: 'Replace `as any` with a proper type definition. Use `unknown` + type guard if type is truly uncertain.',
  },
  {
    name: 'Console Leftover',
    rule: 'ast-slop/console-leftover',
    category: 'Debug Artifacts',
    description: 'Debug console.log/console.debug statements left in production code.',
    bad: `function calculateTotal(items: Item[]) {
  console.log('items', items)
  const total = items.reduce((sum, i) => sum + i.price, 0)
  console.debug('total is', total)
  return total
}`,
    good: `function calculateTotal(items: Item[]) {
  return items.reduce((sum, i) => sum + i.price, 0)
}`,
    fixGuidance: 'Remove debug console statements. Use a proper logger (pino, winston) for intentional logging.',
  },
  {
    name: 'Swallowed Exception',
    rule: 'ast-slop/swallowed-exception',
    category: 'Error Handling',
    description: 'Catch blocks that catch errors but do nothing meaningful with them.',
    bad: `try {
  await sendEmail(user, template)
} catch (e) {
  // email might fail, that is ok
}`,
    good: `try {
  await sendEmail(user, template)
} catch (e) {
  metrics.increment('email.send_failed')
  logger.warn('Email send failed', { userId: user.id, error: e })
}`,
    fixGuidance: 'At minimum log the error. Consider retry logic or alerting for critical paths.',
  },
  {
    name: 'Hallucinated Import',
    rule: 'ast-slop/hallucinated-import',
    category: 'Dependencies',
    description: 'Imports from packages that are not installed or paths that do not exist.',
    bad: `import { magicButton } from '@awesome-ui/button'
import { formatDate } from './utils/dates'  // file does not exist`,
    good: `import { Button } from '@radix-ui/react-button'  // installed
import { formatDate } from './utils/format'  // file exists`,
    fixGuidance: 'Check package.json for installed packages. Verify file paths exist. AI agents often invent imports.',
  },
  {
    name: 'TODO Stub',
    rule: 'ast-slop/todo-stub',
    category: 'Incomplete Code',
    description: 'Functions that just throw "not implemented" or return hardcoded values with TODO comments.',
    bad: `function calculateTax(income: number): number {
  // TODO: implement tax calculation
  return 0
}`,
    good: `function calculateTax(income: number, brackets: TaxBracket[]): number {
  let tax = 0
  let remaining = income
  for (const bracket of brackets) {
    const taxable = Math.min(remaining, bracket.limit)
    tax += taxable * bracket.rate
    remaining -= taxable
    if (remaining <= 0) break
  }
  return tax
}`,
    fixGuidance: 'Implement the function properly or track as a tracked issue, not a code TODO.',
  },
  {
    name: 'Double Type Assertion',
    rule: 'ast-slop/double-assertion',
    category: 'Type Safety',
    description: 'Using `as unknown as X` — a code smell indicating type system violation.',
    bad: `const result = data as unknown as CustomType`,
    good: `const result = CustomTypeSchema.parse(data)  // validate at runtime
// or
const result = transformToCustomType(data)  // explicit conversion`,
    fixGuidance: 'Use runtime validation (zod, io-ts) or write an explicit conversion function.',
  },
  {
    name: 'Duplicate Import',
    rule: 'import-intelligence/duplicate-import',
    category: 'Imports',
    description: 'Same module imported multiple times in a file.',
    bad: `import { useState } from 'react'
import { useEffect } from 'react'
import { useCallback } from 'react'`,
    good: `import { useState, useEffect, useCallback } from 'react'`,
    fixGuidance: 'Merge duplicate imports into a single import statement.',
  },
  {
    name: 'Unused Import',
    rule: 'import-intelligence/unused-import',
    category: 'Imports',
    description: 'Imports that are never referenced in the file.',
    bad: `import { useState, useEffect, useRef } from 'react'  // useRef unused
export function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => { console.log(count) }, [count])
}`,
    good: `import { useState, useEffect } from 'react'
export function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => { console.log(count) }, [count])
}`,
    fixGuidance: 'Remove unused imports. AI agents often add "just in case" imports.',
  },
  {
    name: 'Deep Nesting',
    rule: 'arch-constraints/deep-nesting',
    category: 'Architecture',
    description: 'Code nested more than 4 levels deep, making it hard to read and test.',
    bad: `function process(data: Data) {
  if (data) {
    if (data.items) {
      for (const item of data.items) {
        if (item.active) {
          if (item.value > 0) {
            // deeply nested logic
          }
        }
      }
    }
  }
}`,
    good: `function process(data: Data) {
  if (!data?.items) return
  for (const item of data.items) {
    processItem(item)
  }
}

function processItem(item: Item) {
  if (!item.active || item.value <= 0) return
  // flat logic
}`,
    fixGuidance: 'Use early returns, extract functions, and guard clauses to flatten nesting.',
  },
  {
    name: 'N+1 Query',
    rule: 'perf-hints/n-plus-one',
    category: 'Performance',
    description: 'Making a query inside a loop instead of batching.',
    bad: `for (const userId of userIds) {
  const user = await db.getUser(userId)  // N queries
  results.push(user)
}`,
    good: `const users = await db.getUsers(userIds)  // 1 query
results.push(...users)`,
    fixGuidance: 'Batch queries outside the loop. Use DataLoader or IN clauses for database queries.',
  },
]

