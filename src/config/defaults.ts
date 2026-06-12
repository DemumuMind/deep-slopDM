import type { DeepSlopConfig } from './schema.js'

/** Default configuration matching the canonical values */
export const DEFAULT_CONFIG: DeepSlopConfig = {
  engines: {},
  quality: {
    maxFunctionLoc: 50,
    maxFileLoc: 300,
    maxNesting: 4,
    maxParams: 5,
    maxCyclomatic: 10,
    maxCoupling: 10,
  },
  security: {
    audit: true,
    auditTimeout: 60,
    owasp: true,
  },
  imports: {
    suggestAlternatives: true,
    optimizeBarrels: true,
    validateAliases: true,
    buildGraph: true,
    maxCircularDepth: 5,
  },
  types: {
    flagAsAny: true,
    suggestTypes: true,
    flagDoubleAssertion: true,
  },
  deadCode: {
    unreachableBranches: true,
    unusedExports: true,
    unusedVariables: true,
  },
  i18n: {
    hardcodedStrings: true,
    validateKeys: false,
  },
  exclude: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tmp-*'],
  rules: {},
}
