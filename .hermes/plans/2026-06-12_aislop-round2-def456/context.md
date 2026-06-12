# Context — Recon Summary

## Current deep-slop v0.3.0 (58 files, 13,811 lines)
- 12 engines, 66+ rules
- Density-aware logarithmic scoring
- SARIF 2.1.0 + picocolors terminal theme
- Zod v4 config + YAML loading + extends
- init/doctor CLI commands
- Fix pipeline (safe/force/dry-run/verify)
- GitHub Action + pre-commit hooks
- 3 agent providers (claude/codex/aider)
- Suppress directives + source masking
- MCP server (5 tools)
- tree-sitter utility (graceful fallback)
- Build: 0 errors, tests: 12/12 pass

## aislop gap analysis (28 gaps found)
### HIGH (6):
1. Diff-aware scanning (--changes/--staged/--base)
2. Rule severity overrides (config `rules` field)
3. Per-agent post-edit hooks (hook install/status/baseline)
4. Agent repair loop (worktree isolation, sessions, apply/review)
5. Watch mode (agent monitor + polling daemon)
6. Trend/score history (history.jsonl, sparklines, delta)

### MEDIUM (11):
7. VS Code extension
8. Interactive TUI mode
9. Rules explorer (--search)
10. User-defined architecture rules (.rules.yml)
11. MCP aislop_why tool
12. MCP aislop_fix tool
13. CI subcommand with threshold exit codes
14. Coverage gate
15. JSON schema generation
16. Security audit integration (npm audit)
17. Knip integration

### LOW (11):
18-28. Telemetry, update notifier, badge, live grid, .deep-slopignore, more providers, typo suggest, Expo, multi-language, baseline tool, smoothing param
