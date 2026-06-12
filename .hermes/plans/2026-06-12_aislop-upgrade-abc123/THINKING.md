# THINKING — Risks, Dependencies, Applied Memories

## Top-3 Risks

### Risk 1: Scoring formula regression
- Our current score: `max(0, 100 - penalties)`. Linear, trivial.
- Aislop: density-aware logarithmic: `100 - (100 * log1p(scaledDeductions)) / log1p(100 + scaledDeductions)`
- Risk: projects with existing baselines will see dramatically different scores
- Mitigation: Keep `--scoring=linear` as fallback. Default to `--scoring=density`. Add `--scoring` flag.

### Risk 2: Config breaking changes
- Adding Zod validation may reject valid YAML configs with unknown keys
- Mitigation: Use `z.object({...}).passthrough()` — allow unknown keys, only validate known ones

### Risk 3: SARIF schema compliance
- SARIF 2.1.0 requires specific structure ($schema, version, runs[], results[], etc.)
- Wrong output = GitHub code scanning silently ignores it
- Mitigation: Write SARIF validator test, check against official JSON Schema

## Dependencies between phases
- Phase 2 (SARIF) needs Phase 1 (scoring) because SARIF output includes score
- Phase 5 (fix) needs Phase 1 (scoring) to calculate score improvement
- Phase 4 (init/doctor) needs Phase 3 (config) to scaffold valid config
- Phase 7 (agents) needs Phase 5 (fix) because agents use fix pipeline
- Phase 6 (CI) needs Phase 2 (SARIF) because GitHub Action outputs SARIF
- Phases 3 and 8 are independent — can run in parallel

## Applied memories
- User rule: "Главное правило — Не ошибайся" — zero bugs tolerance
- Language: Russian responses
- Full automation — no manual routing
- User gets frustrated when told to run commands themselves
- read_file prepends line numbers — always strip before writing back
- WSL DNS resolves ALL external domains to 198.18.0.0/15
- aislop URL replacement via template literals is BROKEN for Cyrillic URLs

## Best practices (from aislop codebase)
1. Lazy engine loading — we already do this, keep it
2. Per-rule impact tiers with caps — prevents noisy rules from dominating score
3. Config extends/inheritance — allows monorepo-wide base config
4. Zod schema → JSON Schema auto-generation — editor autocomplete
5. Terminal theme with named colors — consistent UX
6. Fix pipeline: plan → steps → apply → verify — safe auto-fix
7. Suppress directives — user escape hatch for false positives
8. Source masking — redact secrets in diagnostic output
