# THINKING — Risks, Dependencies, Applied Memories

## Top-3 Risks
1. Multi-language linters require external CLI tools — user may not have ruff/golangci-lint installed. Mitigation: detect availability, skip with install instructions.
2. Agent TUI is a complex terminal UI — aislop uses raw readline (zero-dep). We could use ink but that's heavy. Mitigation: use raw readline like aislop.
3. Architecture rules YAML parsing + import extraction across languages — complex. Mitigation: start with regex import extraction (works for JS/TS/Python/Go), upgrade to AST later.

## Dependencies
- Phase 5 (multi-language linters) depends on Phase 4 (security audit — cargo audit is both a security tool and a linter integration pattern)
- Phases 1, 2, 3, 4, 6 are all independent

## Applied Memories
- "Главное правило — Не ошибайся" → every phase has explicit verification
- User prefers Russian → output summary in Russian
- "Сам выполни" → implement, don't describe
- WSL git quirks → catch git errors gracefully
- Token budget very large — max parallelism → phases 1,2,3,4,6 in parallel
