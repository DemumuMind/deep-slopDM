# Phase 6: CI Integrations

**Depends on:** Phase 2 (SARIF output — GitHub Action needs it)
**Objective:** Create GitHub Action, pre-commit hook, and score badge for CI adoption

## Work

### Task 6.1: GitHub Action
**Files:**
- Create: `action.yml`

Composite action that other repos can use:
```yaml
name: deep-slop — Deep AI Code Quality Gate
description: Scan for AI slop, dead code, security issues, and architectural problems
inputs:
  directory:
    description: Directory to scan
    default: "."
  node-version:
    description: Node.js version
    default: "20"
  format:
    description: Output format (human, json, sarif)
    default: "sarif"
  fail-below:
    description: Fail if score below threshold
    default: "50"
  version:
    description: deep-slop CLI version
    default: "latest"
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
    - run: |
        TMPDIR=$(mktemp -d)
        cd "$TMPDIR"
        npm init -y >/dev/null 2>&1
        npm install --save-dev deep-slop@${{ inputs.version }} >/dev/null 2>&1
        npx deep-slop ci ${{ inputs.directory }} --fail-below ${{ inputs.fail-below }} --format ${{ inputs.format }}
      shell: bash
```

### Task 6.2: Pre-commit hook
**Files:**
- Create: `.pre-commit-hooks.yaml`

```yaml
- id: deep-slop
  name: deep-slop
  description: Deep AI slop detection — 12 engines, AST-powered
  entry: deep-slop scan --staged
  language: node
  pass_filenames: false
  require_serial: true
```

### Task 6.3: Score badge command
**Files:**
- Modify: `src/cli.ts` (add badge subcommand)

`deep-slop badge` generates shields.io URL:
`https://img.shields.io/badge/deep--slop-85-Helps%20Work-green`

## Acceptance criteria
- [ ] `action.yml` exists and is valid composite action
- [ ] `.pre-commit-hooks.yaml` exists with correct schema
- [ ] `deep-slop badge` generates shields.io badge URL
- [ ] `npx tsc` compiles cleanly

## Evidence commands
```bash
# Action exists
cat action.yml | head -5
# Pre-commit hook exists
cat .pre-commit-hooks.yaml
# Badge works
node dist/cli.js badge . --exclude node_modules dist
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
