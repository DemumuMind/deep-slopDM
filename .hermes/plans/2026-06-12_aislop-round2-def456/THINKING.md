# THINKING — Risks, Dependencies, Applied Memories

## Top-3 Risks

### Risk 1: Agent repair loop is a full subsystem
- aislop's agent system has ~20 command files, session management, worktree management, provider abstraction
- This is the most complex feature by far
- Mitigation: split into Phase 6 (core loop: scan→fix→verify) and defer sessions/PR to v0.5

### Risk 2: Git operations in WSL
- WSL git operations sometimes hang or require credentials
- Diff-aware scanning and worktree creation depend on git
- Mitigation: use `git diff --name-only` (lightweight), catch errors gracefully

### Risk 3: VS Code extension separate build
- Extension needs vsce, separate tsconfig, webpack/esbuild
- Different module system (CommonJS for extension host)
- Mitigation: scaffold only in Phase 7, defer marketplace publish

## Dependencies
- Phase 4 (watch) depends on Phase 1 (diff-aware) — monitor needs to detect changed files
- Phase 5 (hooks) depends on Phase 2 (severity overrides) — quality-gate hook compares with severity-adjusted score
- Phase 6 (agent repair) depends on Phase 5 (hooks) — repair loop uses quality-gate for convergence check
- Phases 1, 2, 3, 7 are independent

## Applied Memories
- "Главное правило — Не ошибайся" → every phase includes verification
- WSL git quirks → catch git errors gracefully
- User prefers Russian → output in Russian
- "Сам выполни" → implement, don't describe
