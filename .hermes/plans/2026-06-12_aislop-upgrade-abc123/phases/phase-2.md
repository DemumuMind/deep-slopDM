# Phase 2: SARIF Output + Terminal Theme Overhaul

**Depends on:** Phase 1 (scoring — SARIF includes score)
**Objective:** Add SARIF 2.1.0 output for GitHub code scanning, terminal color theme system, grouped diagnostic output

## Work

### Task 2.1: Create SARIF output module
**Files:**
- Create: `src/output/sarif.ts`
- Modify: `src/cli.ts` (add `--sarif` flag, `--format` flag)

SARIF 2.1.0 structure:
```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": { "driver": { "name": "deep-slop", "version": "0.3.0", "rules": [...] } },
    "results": [{ "ruleId": "ast-slop/narrative-comment", "level": "warning", "message": { "text": "..." }, "locations": [{ "physicalLocation": { "artifactLocation": { "uri": "src/foo.ts" }, "region": { "startLine": 42 } } }] }]
  }]
}
```

### Task 2.2: Create terminal theme system
**Files:**
- Create: `src/output/theme.ts`
- Create: `src/output/rule-labels.ts`
- Modify: `src/output/formatter.ts` (complete rewrite)

Theme system with `picocolors`:
```typescript
import pc from 'picocolors'
export const theme = {
  danger: pc.red,
  warn: pc.yellow,
  success: pc.green,
  muted: pc.gray,
  bold: pc.bold,
  info: pc.blue,
  suggestion: pc.cyan,
}
```

### Task 2.3: Grouped diagnostic output
**Files:**
- Modify: `src/output/formatter.ts`

Group diagnostics by engine, then by rule within each engine. Show:
- Engine header with timing
- Rule header with count + severity badge
- Top 3 locations per rule, then "+N more"
- Word-wrap messages at terminal width (cap 120)

### Task 2.4: Add --format and --sarif flags to CLI
**Files:**
- Modify: `src/cli.ts`

Add `--format <human|json|sarif>` and `--sarif` (shorthand for `--format sarif`) flags.

## Acceptance criteria
- [ ] `src/output/sarif.ts` produces valid SARIF 2.1.0 JSON
- [ ] SARIF output includes all diagnostics with correct rule IDs, levels, locations
- [ ] `--sarif` flag on CLI produces SARIF output
- [ ] `--format` flag supports human/json/sarif
- [ ] Terminal output uses color theme (picocolors)
- [ ] Diagnostics grouped by engine then by rule
- [ ] `npx tsc` compiles cleanly
- [ ] `npx vitest run` passes

## Evidence commands
```bash
# SARIF output validates
node dist/cli.js scan . --exclude node_modules dist --sarif 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d);console.log('SARIF version:',r.version,'Runs:',r.runs.length,'Results:',r.runs[0].results.length)"

# Terminal output has colors
node dist/cli.js scan . --exclude node_modules dist 2>&1 | head -20

# Build
npx tsc
npx vitest run
```

## Mandatory commands
```bash
npx tsc
npx vitest run
node dist/cli.js scan . --exclude node_modules dist --sarif
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
