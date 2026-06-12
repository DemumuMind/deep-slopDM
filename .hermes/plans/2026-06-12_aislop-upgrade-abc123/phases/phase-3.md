# Phase 3: Zod Config Validation

**Depends on:** none (parallel with Phase 1)
**Objective:** Replace bare TypeScript interfaces with Zod v4 schemas for config validation, add config file loading, extends/inheritance, JSON Schema generation

## Work

### Task 3.1: Create Zod config schema
**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/extends.ts`
- Create: `src/config/index.ts`

Zod schema for DeepSlopConfig with:
- `z.object()` for all config sections
- `.passthrough()` for unknown keys (forward compatibility)
- `.default()` for optional fields
- `.transform()` for type coercion (string → number for thresholds)

### Task 3.2: Config file loader
**Files:**
- Create: `src/config/index.ts`

Load `.deep-slop/config.yml` (or `.deep-slop/config.yaml` or `.deep-slop/config.json`):
1. Search up directory tree for config file
2. Parse YAML/JSON
3. Validate against Zod schema
4. Merge with DEFAULT_CONFIG (deep merge)
5. Handle `extends` key — load parent config and merge

### Task 3.3: JSON Schema generation script
**Files:**
- Create: `scripts/gen-config-schema.mjs`
- Create: `schema/deep-slop.config.schema.json`

Use `zod-to-json-schema` to auto-generate JSON Schema from Zod schema.
This enables VS Code autocomplete when editing config.

### Task 3.4: Update types/index.ts to use Zod schema
**Files:**
- Modify: `src/types/index.ts`

Export `DeepSlopConfigSchema` from config/schema.ts. Keep TypeScript interface as `z.infer<typeof DeepSlopConfigSchema>`.

## Acceptance criteria
- [ ] `src/config/schema.ts` has Zod v4 schema for full DeepSlopConfig
- [ ] Config file loading works for YAML and JSON
- [ ] Invalid config produces clear error message with field path
- [ ] `extends` key loads parent config and deep-merges
- [ ] `schema/deep-slop.config.schema.json` generated from Zod schema
- [ ] `npx tsc` compiles cleanly
- [ ] `npx vitest run` passes

## Evidence commands
```bash
# Config module exists
ls src/config/*.ts | wc -l
# Expected: 4

# Schema generated
cat schema/deep-slop.config.schema.json | node -e "const s=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log('Schema title:',s.title,'Properties:',Object.keys(s.properties).length)"

# Build
npx tsc
npx vitest run
```

## Mandatory commands
```bash
npx tsc
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
