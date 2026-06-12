# Phase 2: Architecture Rules Engine

**Depends on:** none
**Objective:** Add user-defined architecture rules via .deep-slop/rules.yml with forbid_import, forbid_import_from_path, and require_pattern rule types

## Work

### Task 2.1: Rules YAML loader
**Files:**
- Create: `src/engines/arch-rules/loader.ts`

Load rules from .deep-slop/rules.yml:
```yaml
rules:
  - name: "No axios"
    type: forbid_import
    match: "**/*.ts"
    forbid: "axios"
    severity: error

  - name: "Controllers can't import DB"
    type: forbid_import_from_path
    from: "src/controllers/**"
    forbid: "src/database/**"
    severity: warning

  - name: "Routes must have try/catch"
    type: require_pattern
    match: "src/routes/**"
    pattern: "try\\s*\\{"
    severity: warning
```

Parse with js-yaml (already installed). Validate structure.

### Task 2.2: Rule matchers
**Files:**
- Create: `src/engines/arch-rules/matchers.ts`

Implement 3 rule types:
- `applyForbidImport(rule, fileContent, filePath)` — checks if forbidden import exists in file
- `applyForbidImportFromPath(rule, fileContent, filePath)` — checks if file matching `from` pattern imports from `forbid` path
- `applyRequirePattern(rule, fileContent, filePath)` — checks if file matching `match` pattern contains required regex

Import extraction via regex (supports JS/TS, Python, Go):
- JS/TS: `import ... from '...'` + `require('...')`
- Python: `import ...` + `from ... import`
- Go: `import "..."`

Glob matching via minimatch (install: `pnpm add minimatch`).

### Task 2.3: Architecture rules engine
**Files:**
- Create: `src/engines/arch-rules/index.ts`

Engine that implements the `Engine` interface:
- name: 'arch-rules'
- Loads rules from .deep-slop/rules.yml via loader
- For each rule, runs the appropriate matcher across all files
- Produces Diagnostic for each violation with rule name, severity, file, line

### Task 2.4: Register engine + example config
**Files:**
- Modify: `src/types/index.ts` — add 'arch-rules' to EngineName
- Modify: `src/engines/orchestrator.ts` — add lazy loader for arch-rules
- Modify: `src/cli.ts` — add arch-rules to rules command
- Create: `examples/architecture-rules.yml` — sample rules file

## Acceptance criteria
- [ ] `.deep-slop/rules.yml` with `forbid_import` rule produces diagnostic when forbidden import is found
- [ ] `forbid_import_from_path` rule detects cross-layer import violations
- [ ] `require_pattern` rule flags files missing required code patterns
- [ ] Engine produces diagnostics with correct severity from rule definition
- [ ] If no rules.yml exists, engine runs but produces 0 diagnostics
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Create sample rules and scan
mkdir -p .deep-slop && cat > .deep-slop/rules.yml << 'EOF'
rules:
  - name: "No console.log"
    type: require_pattern
    match: "**/*.ts"
    pattern: "console\\.log"
    severity: info
EOF
node dist/cli.js scan . --exclude node_modules dist 2>&1 | grep "arch-rules"
npx tsc --noEmit && npx vitest run
```

## Mandatory commands
```bash
npx tsc --noEmit
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
