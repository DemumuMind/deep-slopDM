# DEEP-SLOP Upgrade from aislop — ROADMAP

**Goal:** Borrow the best production-grade features from aislop v0.12.0 to transform deep-slop from a prototype into a competitive, polished tool.
**Architecture:** Replace our linear scoring with density-aware logarithmic scoring + per-rule impact tiers. Add SARIF output, CLI polish (init/doctor), Zod config validation, terminal theme, fix pipeline, and CI integrations — while keeping our competitive advantages (12 engines, tree-sitter, import intelligence, suggestion system).
**Baseline ref:** 2d89dbe72c7d523b9b6eb9dcf43275b8a25beb85
**Total phases:** 8
**Estimated complexity:** large

## Risks
1. **Scoring regression** — Changing scoring formula invalidates all existing baselines. Mitigation: keep old scoring as `--scoring=linear` fallback, new default is `--scoring=density`.
2. **Config breaking change** — Adding Zod validation may reject previously valid configs. Mitigation: use `.passthrough()` on unknown keys, graceful fallback to defaults.
3. **SARIF schema compliance** — SARIF 2.1.0 has strict schema; wrong output breaks GitHub code scanning. Mitigation: validate output against official SARIF JSON Schema in tests.

## Phase plan
| Phase | Name | Depends on | Key deliverable |
|-------|------|-----------|-----------------|
| 1 | Density-aware scoring system | — | `src/scoring/` with logarithmic formula, 60+ rule impact tiers, per-engine weights |
| 2 | SARIF output + output overhaul | Phase 1 | `src/output/sarif.ts`, terminal theme system, grouped diagnostics |
| 3 | Zod config validation | — | `src/config/schema.ts`, `.deep-slop/config.yml` loader, JSON Schema gen |
| 4 | CLI polish: init + doctor commands | Phase 3 | `deep-slop init`, `deep-slop doctor` commands |
| 5 | Fix pipeline | Phase 1 | Plan → steps → apply → verify flow, safe/force modes |
| 6 | CI integrations | Phase 2 | `action.yml`, `.pre-commit-hooks.yaml`, score badge |
| 7 | Coding agent integrations | Phase 5 | `--claude`, `--codex`, `--cursor` flags for fix command |
| 8 | Suppress directives + source masking | — | `// deep-slop-disable-next-line`, secret redaction |

## Mandatory verification commands
- Build: `npx tsc`
- Typecheck: `npx tsc --noEmit`
- Tests: `npx vitest run`
- Self-scan: `node dist/cli.js scan . --exclude node_modules dist --json`
