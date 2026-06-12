# DEEP-SLOP Round 2 — ROADMAP

**Goal:** Borrow the 6 highest-priority features from aislop that deep-slop v0.3.0 still lacks, plus 4 medium-priority features that close the competitive gap.
**Architecture:** All new features integrate into existing src/ structure — new modules alongside existing engines/scoring/config/fix/agents/output/ modules.
**Baseline ref:** ca2a39bc72febdad6c187d78b5627c535a3a6fb7
**Total phases:** 8
**Estimated complexity:** large

## Risks
1. **Agent worktree repair loop complexity** — the flagship feature involves git worktree management, session persistence, provider abstraction. Mitigation: implement in 2 phases (core loop first, sessions/PR second).
2. **VS Code extension packaging** — requires vsce, separate build pipeline, marketplace publishing. Mitigation: scaffold extension only, defer publishing.
3. **Rule severity overrides breaking scoring** — changing severity after engine emits diagnostics could skew score. Mitigation: apply overrides in orchestrator AFTER engines run, BEFORE scoring.

## Phase plan
| Phase | Name | Depends on | Key deliverable |
|-------|------|-----------|-----------------|
| 1     | Diff-aware scanning | — | --changes/--staged/--base flags |
| 2     | Rule severity overrides | — | config `rules` field + applyRuleSeverities() |
| 3     | Trend/score history | — | .deep-slop/history.jsonl + trend command + sparklines |
| 4     | Watch mode + file monitor | Phase 1 | agent monitor command + polling daemon |
| 5     | Hook system (per-agent) | Phase 2 | hook install/status/baseline/quality-gate |
| 6     | Agent repair loop (core) | Phase 5 | worktree isolation + provider loop + verify |
| 7     | VS Code extension | — | editors/vscode/ scaffolding + diagnostics |
| 8     | MCP why/fix tools + rules explorer | Phase 2 | deep_slop_why + deep_slop_fix + rules --search |

## Mandatory verification commands
- Build: `npx tsc`
- Typecheck: `npx tsc --noEmit`
- Tests: `npx vitest run`
