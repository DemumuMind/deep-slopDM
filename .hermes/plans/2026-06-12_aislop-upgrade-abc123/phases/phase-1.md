# Phase 1: Density-Aware Scoring System

**Depends on:** none
**Objective:** Replace our primitive linear scoring with aislop's density-aware logarithmic scoring + per-rule impact tiers

## Work

### Task 1.1: Create scoring directory structure
**Files:**
- Create: `src/scoring/index.ts`
- Create: `src/scoring/rule-impact.ts`
- Create: `src/scoring/rule-severity.ts`
- Create: `src/scoring/types.ts`

**Step 1:** Create `src/scoring/types.ts` — scoring-specific types
```typescript
export type ScoringMode = 'density' | 'linear'
export type ImpactTier = 'strict' | 'standard' | 'maintainability' | 'mechanical' | 'style' | 'advisory'

export interface RuleImpact {
  tier: ImpactTier
  multiplier: number
  cap: number
  rationale: string
}

export interface ScoringConfig {
  mode: ScoringMode
  weights: Partial<Record<string, number>>
  thresholds: { good: number; ok: number; critical: number }
  smoothing: number
}
```

**Step 2:** Create `src/scoring/rule-impact.ts` — 60+ rule classifications
Map every rule ID from all 12 engines to an impact tier with multiplier and cap.
- strict (1.0x, cap=40): security/hardcoded-secret, security/eval-usage, dead-flow/unreachable-after-terminator
- standard (1.0x, cap=30): ast-slop/narrative-comment, import-intelligence/circular-dependency
- maintainability (0.75x, cap=24): arch-constraints/high-coupling, arch-constraints/god-file
- mechanical (0.5x, cap=16): ast-slop/trivial-comment, syntax-deep/crlf-line-endings, config-lint/*
- style (0.5x, cap=8): ast-slop/decorative-comment, dup-detect/duplicate-imports
- advisory (0.25x, cap=8): perf-hints/react-missing-memo, i18n-lint/hardcoded-string, meta-quality/*

**Step 3:** Create `src/scoring/rule-severity.ts` — severity weight mapping
```typescript
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  error: 10,
  warning: 3,
  info: 1,
  suggestion: 0.5,
}
```

**Step 4:** Create `src/scoring/index.ts` — density-aware logarithmic scoring
```typescript
import { RuleImpact, ScoringConfig, ImpactTier } from './types.js'
import { RULE_IMPACTS } from './rule-impact.js'
import { SEVERITY_WEIGHTS } from './rule-severity.js'
import type { Diagnostic, EngineName, Severity } from '../types/index.js'

const TIER_DEFAULTS: Record<ImpactTier, { multiplier: number; cap: number }> = {
  strict: { multiplier: 1.0, cap: 40 },
  standard: { multiplier: 1.0, cap: 30 },
  maintainability: { multiplier: 0.75, cap: 24 },
  mechanical: { multiplier: 0.5, cap: 16 },
  style: { multiplier: 0.5, cap: 8 },
  advisory: { multiplier: 0.25, cap: 8 },
}

const DEFAULT_CONFIG: ScoringConfig = {
  mode: 'density',
  weights: {},
  thresholds: { good: 75, ok: 50, critical: 0 },
  smoothing: 10,
}

export function calculateScore(
  diagnostics: Diagnostic[],
  fileCount: number,
  config: ScoringConfig = DEFAULT_CONFIG,
): { score: number; label: string; penalty: number; density: number } {
  if (config.mode === 'linear') return calculateLinearScore(diagnostics)

  // Density-aware logarithmic scoring (from aislop)
  const density = Math.min(1, diagnostics.length / (fileCount + config.smoothing))

  let totalDeduction = 0
  const ruleCounts = new Map<string, number>()

  for (const d of diagnostics) {
    const key = d.rule
    const count = (ruleCounts.get(key) ?? 0) + 1
    ruleCounts.set(key, count)

    const impact = RULE_IMPACTS[key] ?? TIER_DEFAULTS.advisory
    const tierDefault = TIER_DEFAULTS[impact.tier]
    const multiplier = impact.multiplier ?? tierDefault.multiplier
    const cap = impact.cap ?? tierDefault.cap

    // Skip if over cap for this rule
    if (count > cap) continue

    const engineWeight = config.weights[d.engine] ?? 1.0
    const severityWeight = SEVERITY_WEIGHTS[d.severity]
    totalDeduction += severityWeight * multiplier * engineWeight
  }

  const scaledDeduction = totalDeduction * density
  const score = Math.round(100 - (100 * Math.log1p(scaledDeduction)) / Math.log1p(100 + scaledDeduction))
  const clampedScore = Math.max(0, Math.min(100, score))

  const label = clampedScore >= config.thresholds.good ? 'Healthy'
    : clampedScore >= config.thresholds.ok ? 'Needs Work'
    : 'Critical'

  return { score: clampedScore, label, penalty: totalDeduction, density }
}

function calculateLinearScore(diagnostics: Diagnostic[]) {
  // Fallback: old linear formula
  let penalty = 0
  for (const d of diagnostics) penalty += SEVERITY_WEIGHTS[d.severity]
  const score = Math.max(0, Math.round(100 - penalty))
  return { score, label: score >= 75 ? 'Healthy' : score >= 50 ? 'Needs Work' : 'Critical', penalty, density: 0 }
}
```

**Step 5:** Update `src/engines/orchestrator.ts` — use new scoring
Replace `calculateScore` function call with import from `../scoring/index.js`.
Add `filesScanned` to the context passed to scoring.

**Verification:**
Run: `npx tsc --noEmit`
Expected: 0 errors

## Acceptance criteria
- [ ] `src/scoring/` directory exists with 4 files (types.ts, rule-impact.ts, rule-severity.ts, index.ts)
- [ ] 60+ rules classified across 6 impact tiers with multiplier + cap
- [ ] `calculateScore()` returns density-aware logarithmic score between 0-100
- [ ] `--scoring=linear` fallback produces identical results to old formula
- [ ] Score labels: Healthy (>=75), Needs Work (>=50), Critical (<50)
- [ ] Orchestrator uses new scoring without breaking scan output
- [ ] `npx tsc` compiles cleanly

## Evidence commands
```bash
# Proves scoring module exists
ls src/scoring/*.ts | wc -l
# Expected: 4

# Proves rule coverage
grep -c "'" src/scoring/rule-impact.ts
# Expected: 60+

# Proves build works
npx tsc --noEmit
# Expected: 0 errors

# Proves scan still works with new scoring
node dist/cli.js scan . --exclude node_modules dist --json 2>/dev/null | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Score:',r.score,'Label:',r.label??'none')})"
# Expected: Score between 0-100 with label
```

## Mandatory commands
```bash
npx tsc
npx vitest run
node dist/cli.js scan . --exclude node_modules dist --json
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME comments
- No dead imports
- Clean override: no
