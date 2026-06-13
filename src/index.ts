// deep-slop — Deep AI slop detection with 18 engines
// Public API exports

export type {
  BuiltinEngineName,
  EngineName,
  Severity,
  Language,
  Framework,
  Category,
  Diagnostic,
  Suggestion,
  EngineResult,
  EngineContext,
  Engine,
  FixResult,
  DeepSlopConfig,
  ScanResult,
} from "./types/index.js";

export { DEFAULT_CONFIG, ALL_ENGINE_NAMES } from "./types/index.js";
export { runScan, runFix } from "./engines/orchestrator.js";
export { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js";

