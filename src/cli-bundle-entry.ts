// ── CLI Bundle Entry ──────────────────────────────────
// This file eagerly imports all engines so esbuild can
// inline them into a single bundled file. The orchestrator's
// lazy dynamic imports are replaced at build time.

import { astSlopEngine } from './engines/ast-slop/index.js'
import { importIntelligenceEngine } from './engines/import-intelligence/index.js'
import { deadFlowEngine } from './engines/dead-flow/index.js'
import { typeSafetyEngine } from './engines/type-safety/index.js'
import { syntaxDeepEngine } from './engines/syntax-deep/index.js'
import { securityDeepEngine } from './engines/security-deep/index.js'
import { archConstraintsEngine } from './engines/arch-constraints/index.js'
import { dupDetectEngine } from './engines/dup-detect/index.js'
import { perfHintsEngine } from './engines/perf-hints/index.js'
import { i18nLintEngine } from './engines/i18n-lint/index.js'
import { configLintEngine } from './engines/config-lint/index.js'
import { metaQualityEngine } from './engines/meta-quality/index.js'
import { lintExternalEngine } from './engines/lint-external/index.js'
import { archRulesEngine } from './engines/arch-rules/index.js'
import { knipEngine } from './engines/knip/index.js'
import { formatLintEngine } from './engines/format-lint/index.js'
import { frameworkLintEngine } from './engines/framework-lint/index.js'
import { markupLintEngine } from './engines/markup-lint/index.js'
import { rustDeepEngine } from './engines/rust-deep/index.js'
import { pythonDeepEngine } from './engines/python-deep/index.js'
import { goDeepEngine } from './engines/go-deep/index.js'

import { registerEngines } from './engines/orchestrator.js'

// Register all engines eagerly (replaces lazy dynamic imports)
registerEngines({
  'ast-slop': astSlopEngine,
  'import-intelligence': importIntelligenceEngine,
  'dead-flow': deadFlowEngine,
  'type-safety': typeSafetyEngine,
  'syntax-deep': syntaxDeepEngine,
  'security-deep': securityDeepEngine,
  'arch-constraints': archConstraintsEngine,
  'dup-detect': dupDetectEngine,
  'perf-hints': perfHintsEngine,
  'i18n-lint': i18nLintEngine,
  'config-lint': configLintEngine,
  'meta-quality': metaQualityEngine,
  'lint-external': lintExternalEngine,
  'arch-rules': archRulesEngine,
  'knip': knipEngine,
  'format-lint': formatLintEngine,
  'framework-lint': frameworkLintEngine,
  'markup-lint': markupLintEngine,
  'rust-deep': rustDeepEngine,
  'python-deep': pythonDeepEngine,
  'go-deep': goDeepEngine,
})

// Now run the CLI
import './cli.js'
