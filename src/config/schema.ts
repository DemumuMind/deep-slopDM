import { z } from 'zod'

/** All 12 engine identifiers */
export const EngineNameSchema = z.enum([
  'ast-slop',
  'import-intelligence',
  'dead-flow',
  'type-safety',
  'syntax-deep',
  'security-deep',
  'arch-constraints',
  'dup-detect',
  'perf-hints',
  'i18n-lint',
  'config-lint',
  'meta-quality',
])

/** Quality thresholds schema */
export const QualitySchema = z.object({
  maxFunctionLoc: z.number(),
  maxFileLoc: z.number(),
  maxNesting: z.number(),
  maxParams: z.number(),
  maxCyclomatic: z.number(),
  maxCoupling: z.number(),
}).passthrough()

/** Security engine schema */
export const SecuritySchema = z.object({
  audit: z.boolean(),
  auditTimeout: z.number(),
  owasp: z.boolean(),
}).passthrough()

/** Import intelligence schema */
export const ImportsSchema = z.object({
  suggestAlternatives: z.boolean(),
  optimizeBarrels: z.boolean(),
  validateAliases: z.boolean(),
  buildGraph: z.boolean(),
  maxCircularDepth: z.number(),
}).passthrough()

/** Type safety schema */
export const TypesSchema = z.object({
  flagAsAny: z.boolean(),
  suggestTypes: z.boolean(),
  flagDoubleAssertion: z.boolean(),
}).passthrough()

/** Dead code schema */
export const DeadCodeSchema = z.object({
  unreachableBranches: z.boolean(),
  unusedExports: z.boolean(),
  unusedVariables: z.boolean(),
}).passthrough()

/** i18n schema */
export const I18nSchema = z.object({
  hardcodedStrings: z.boolean(),
  validateKeys: z.boolean(),
}).passthrough()

/** CI quality gate schema */
export const CiSchema = z.object({
  failBelow: z.number(),
}).passthrough()

/**
 * Raw config schema — what users can provide in their config file.
 * All top-level sections are optional since they'll be merged with defaults.
 * Uses z.record(z.string(), z.boolean()) for engines to support
 * Partial<Record<EngineName, boolean>> semantics.
 */
export const RawConfigSchema = z.object({
  engines: z.record(z.string(), z.boolean()).optional(),
  quality: QualitySchema.optional(),
  security: SecuritySchema.optional(),
  imports: ImportsSchema.optional(),
  types: TypesSchema.optional(),
  deadCode: DeadCodeSchema.optional(),
  i18n: I18nSchema.optional(),
  exclude: z.array(z.string()).optional(),
  ci: CiSchema.optional(),
  extends: z.string().optional(),
}).passthrough()

/**
 * Full DeepSlop configuration schema — the final validated shape
 * after merging with defaults. All sections are required.
 */
export const DeepSlopConfigSchema = z.object({
  /** Which engines are enabled (default: all) */
  engines: z.record(z.string(), z.boolean()),
  /** Quality thresholds */
  quality: QualitySchema,
  /** Security engine config */
  security: SecuritySchema,
  /** Import intelligence config */
  imports: ImportsSchema,
  /** Type safety config */
  types: TypesSchema,
  /** Dead code config */
  deadCode: DeadCodeSchema,
  /** i18n config */
  i18n: I18nSchema,
  /** Exclude patterns */
  exclude: z.array(z.string()),
  /** CI quality gate */
  ci: CiSchema.optional(),
}).passthrough()

/** Inferred TypeScript type from the Zod schema */
export type DeepSlopConfig = z.infer<typeof DeepSlopConfigSchema>
