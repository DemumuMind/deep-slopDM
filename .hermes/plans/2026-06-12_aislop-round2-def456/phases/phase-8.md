# Phase 8: MCP why/fix Tools + Rules Explorer

**Depends on:** Phase 2 (rule severity overrides — why tool needs to show current severity)
**Objective:** Add deep_slop_why and deep_slop_fix MCP tools, plus interactive rules explorer in CLI

## Work

### Task 8.1: MCP deep_slop_why tool
**Files:**
- Modify: `src/mcp.ts`

Add tool `deep_slop_why`:
- Input: `{ rule_id: string }`
- Output: { rule_id, engine, severity, impact_tier, description, hint, documentation_url }
- Maps rule ID to rule-impact.ts (tier/rationale) + rule-labels.ts (description)
- documentation_url: `https://github.com/cardtest15-coder/deep-slop/wiki/rules#${slug}`

### Task 8.2: MCP deep_slop_fix tool
**Files:**
- Modify: `src/mcp.ts`

Add tool `deep_slop_fix`:
- Input: `{ directory: string, safe?: boolean }`
- Runs scan → collects fixable diagnostics → applies fixes → re-scans
- Output: { ok, fixedCount, scoreBefore, scoreAfter, delta, remainingIssues }
- Uses fix pipeline from src/fix/

### Task 8.3: Rules explorer CLI command
**Files:**
- Modify: `src/cli.ts`

Enhance existing `rules` command:
- `deep-slop rules` — list all rules grouped by engine
- `deep-slop rules --search <query>` — fuzzy search rules by name/description
- `deep-slop rules <rule-id>` — show per-rule detail (engine, severity, tier, fixability, description, help)

Output format (human mode):
```
  ast-slop (10 rules)
    ✗ narrative-comment     STRICT   error    fixable
    ✗ trivial-comment       MECH     warning  fixable
    ○ decorative-comment    STYLE    info     —
    ...

  security-deep (7 rules)
    ✗ eval-usage            STRICT   error    —
    ...
```

### Task 8.4: Rule catalog function
**Files:**
- Create: `src/engines/catalog.ts`

```typescript
// catalogRuleIds(): RuleInfo[]
// Returns all rule IDs across all engines with metadata:
// { id, engine, severity, impactTier, fixable, description, help }
// Loads from rule-impact.ts + rule-labels.ts + engine descriptions
```

## Acceptance criteria
- [ ] MCP tool `deep_slop_why` returns rule explanation for any rule ID
- [ ] MCP tool `deep_slop_fix` runs scan→fix→verify and returns before/after comparison
- [ ] `deep-slop rules` lists all rules grouped by engine with severity/tier badges
- [ ] `deep-slop rules --search narrative` finds rules matching "narrative"
- [ ] `deep-slop rules ast-slop/narrative-comment` shows detailed rule info
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Rules list
node dist/cli.js rules | head -20
# Search
node dist/cli.js rules --search "narrative"
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
