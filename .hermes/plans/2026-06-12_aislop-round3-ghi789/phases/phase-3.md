# Phase 3: CI Subcommand + Coverage Gate

**Depends on:** none
**Objective:** Add dedicated `deep-slop ci` command with threshold-based exit codes and scoreable file awareness

## Work

### Task 3.1: CI command implementation
**Files:**
- Modify: `src/cli.ts` — enhance existing `ci` command

Current ci command just runs scan. Enhance to:
- Default output: JSON (CI-friendly)
- `--human` flag: readable CI output with summary
- `--sarif` flag: SARIF output for GitHub Code Scanning
- `--fail-below <n>`: exit code 1 if score < threshold (default from config ci.failBelow: 70)
- `--fail-on-errors`: exit code 1 if any error-severity diagnostics found (regardless of score)
- Exit codes: 0 = pass, 1 = fail threshold, 2 = scan error

### Task 3.2: Coverage gate / scoreable file awareness
**Files:**
- Create: `src/utils/coverage-gate.ts`

```typescript
interface CoverageInfo {
  totalFiles: number
  scoreableFiles: number
  coverage: number  // 0-1 ratio
  dominantLanguage: string
  isScoreable: boolean  // true if coverage >= 0.3 (30%)
  reason?: string  // why score is withheld
}

function assessCoverage(languages: Record<string, number>, totalFiles: number): CoverageInfo
// If supported files (TS/JS/TSX/JSX) are < 30% of total:
//   isScoreable = false
//   reason = "Only 15% of files are TypeScript/JavaScript. Score withheld — mostly <language> project."
// Else:
//   isScoreable = true
```

### Task 3.3: Exit code computation
**Files:**
- Create: `src/utils/exit-code.ts`

```typescript
function computeExitCode(options: {
  hasErrors: boolean
  scoreable: boolean
  score: number
  failBelow: number
}): number
// If hasErrors AND fail-on-errors: return 1
// If scoreable AND score < failBelow: return 1
// If !scoreable: return 0 (can't judge score)
// Else: return 0
```

### Task 3.4: Config CI section
**Files:**
- Modify: `src/config/schema.ts` — add ci section:
  ```yaml
  ci:
    failBelow: 70
    format: "json"
    failOnErrors: true
  ```
- Modify: `src/config/defaults.ts` — add ci defaults

## Acceptance criteria
- [ ] `deep-slop ci .` exits with code 0 when score >= failBelow
- [ ] `deep-slop ci . --fail-below 90` exits with code 1 when score < 90
- [ ] `deep-slop ci . --human` prints readable summary
- [ ] `deep-slop ci . --sarif` outputs SARIF format
- [ ] Coverage gate withholds score when <30% of files are supported languages
- [ ] Config ci.failBelow sets default threshold
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# CI pass
node dist/cli.js ci . --fail-below 0 --exclude node_modules dist; echo "Exit: $?"
# CI fail
node dist/cli.js ci . --fail-below 99 --exclude node_modules dist; echo "Exit: $?"
# Build + test
npx tsc --noEmit && npx vitest run
```

## Mandatory commands
```bash
npx tsc --noEmit
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
