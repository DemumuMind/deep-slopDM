# Phase 8: Suppress Directives + Source Masking

**Depends on:** none (independent)
**Objective:** Add `// deep-slop-disable-next-line` suppress directives and secret redaction in output

## Work

### Task 8.1: Suppress directive parser
**Files:**
- Create: `src/utils/suppress.ts`
- Modify: All engine `run()` methods (check suppress directives before emitting diagnostics)

Support patterns:
- `// deep-slop-disable-next-line` — suppress all rules on next line
- `// deep-slop-disable-next-line rule-name` — suppress specific rule on next line
- `/* deep-slop-disable */` ... `/* deep-slop-enable */` — block suppress
- `// deep-slop-disable-line` — suppress on current line

Implementation:
1. First pass: scan for suppress directives, build suppress map (line → rules to skip)
2. Second pass: filter diagnostics that match suppress map

### Task 8.2: Source masking
**Files:**
- Create: `src/utils/source-mask.ts`
- Modify: `src/output/formatter.ts`, `src/output/sarif.ts`

Redact patterns in diagnostic messages:
- API keys: `sk-...`, `ghp_...`, `AKIA...`
- Tokens: Bearer `...`
- Passwords: `password=...`, `pwd: ...`
- URLs with credentials: `https://user:pass@...`

Replace with `[REDACTED]` in output.

## Acceptance criteria
- [ ] `// deep-slop-disable-next-line` suppresses all diagnostics on next line
- [ ] `// deep-slop-disable-next-line ast-slop/narrative-comment` suppresses specific rule
- [ ] Block suppress `/* deep-slop-disable */` ... `/* deep-slop-enable */` works
- [ ] Source masking redacts API keys, tokens, passwords in output
- [ ] SARIF output also has redacted secrets
- [ ] `npx tsc` compiles cleanly
- [ ] `npx vitest run` passes

## Evidence commands
```bash
# Suppress directive test
echo '// deep-slop-disable-next-line\nconst x = obj as any;' > /tmp/test-suppress.ts
node dist/cli.js scan /tmp/test-suppress.ts --json 2>/dev/null | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log('Diagnostics on suppressed line:', r.totalDiagnostics)"

# Source masking test
echo 'const key = "sk-test-abc123"' > /tmp/test-mask.ts
node dist/cli.js scan /tmp/test-mask.ts 2>&1 | grep -c "REDACTED"

npx tsc
npx vitest run
```

## Mandatory commands
```bash
npx tsc
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
