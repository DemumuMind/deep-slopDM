# Phase 2: Rule Severity Overrides

**Depends on:** none
**Objective:** Add per-rule severity override in config so users can turn off noisy rules or upgrade them to errors

## Work

### Task 2.1: Rules field in config schema
**Files:**
- Modify: `src/config/schema.ts`

Add to DeepSlopConfigSchema:
```typescript
rules: z.record(z.string(), z.enum(['error', 'warning', 'info', 'off'])).default({}).optional()
```

Add to DEFAULT_CONFIG in `src/config/defaults.ts`:
```typescript
rules: {}
```

### Task 2.2: applyRuleSeverities function
**Files:**
- Create: `src/scoring/rule-overrides.ts`

```typescript
// applyRuleSeverities(diagnostics: Diagnostic[], overrides: Record<string, SeverityOverride>): Diagnostic[]
// For each diagnostic:
//   - If rule has override "off": remove it (filter out)
//   - If rule has override "error"/"warning"/"info": rewrite d.severity
//   - If rule has wildcard prefix match (e.g. "ast-slop/*"): apply to all rules under that prefix
// Return filtered + re-severitized diagnostics
```

### Task 2.3: Integrate into orchestrator
**Files:**
- Modify: `src/engines/orchestrator.ts`

After all engines produce diagnostics, BEFORE calculateScore():
1. Load config.rules overrides
2. Call applyRuleSeverities(allDiagnostics, config.rules)
3. Use the adjusted diagnostics for scoring and output

### Task 2.4: CLI --rule flag
**Files:**
- Modify: `src/cli.ts`

Add per-scan rule override:
- `--rule <rule=severity>`: e.g. `--rule "ast-slop/narrative-comment=off" --rule "security-deep/eval-usage=error"`
- Merge with config rules (CLI overrides take precedence)

## Acceptance criteria
- [ ] Config `rules: { "ast-slop/narrative-comment": "off" }` suppresses that rule's diagnostics
- [ ] Config `rules: { "security-deep/*": "error" }` upgrades all security-deep rules to error
- [ ] `--rule "rule-id=off"` CLI flag suppresses a rule for this scan
- [ ] Suppressed diagnostics don't affect the score
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Override via CLI
node dist/cli.js scan . --rule "ast-slop/narrative-comment=off" --exclude node_modules dist --json 2>/dev/null | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));const ast=r.engines.find(e=>e.engine==='ast-slop');console.log('Narrative comment count:',ast.diagnostics.filter(d=>d.rule==='ast-slop/narrative-comment').length)"
# Expected: 0

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
