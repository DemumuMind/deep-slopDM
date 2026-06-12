# Phase 7: VS Code Extension

**Depends on:** none (parallel with Phases 1-3)
**Objective:** Scaffold a VS Code extension that surfaces deep-slop diagnostics in the editor

## Work

### Task 7.1: Extension scaffolding
**Files:**
- Create: `editors/vscode/package.json` — VS Code extension manifest
- Create: `editors/vscode/tsconfig.json` — separate tsconfig for extension
- Create: `editors/vscode/src/extension.ts` — activation + deactivation
- Create: `editors/vscode/src/scanner.ts` — CLI wrapper

Extension manifest:
- `contributes.commands`: deep-slop.scanWorkspace, deep-slop.scanFile
- `contributes.configuration`: deep-slop.path, deep-slop.scanOnSave, deep-slop.autoScan
- `activationEvents`: onCommand:deep-slop.scanWorkspace, onLanguage:typescript

### Task 7.2: Diagnostic collection
**Files:**
- Create: `editors/vscode/src/diagnostics.ts`

Parse deep-slop JSON output and convert to VS Code Diagnostics:
- Map severity: error→Error, warning→Warning, info→Information, suggestion→Hint
- Map file/line/column to VS Code Uri + Position
- Group by file for diagnostic collection
- Code action provider for fixable diagnostics (insert suggestion)

### Task 7.3: Status bar item
**Files:**
- Create: `editors/vscode/src/statusbar.ts`

Show `deep-slop 85/100` in status bar:
- Green for >=75, yellow for >=50, red for <50
- Tooltip: error/warning/fixable counts
- Click: run scan

### Task 7.4: Secure CLI resolution
**Files:**
- Create: `editors/vscode/src/cli.ts`

Only use user-level `deep-slop.path` setting (not workspace settings) for security.
If not set, try PATH resolution. If not found, show install prompt.

## Acceptance criteria
- [ ] `editors/vscode/` directory contains complete extension source
- [ ] `package.json` has correct manifest with commands and configuration
- [ ] Extension activates on TypeScript files
- [ ] Scan command produces VS Code diagnostics
- [ ] Status bar shows score
- [ ] `npx tsc --noEmit` (project root) = 0 errors
- [ ] Note: extension itself doesn't need to compile with the main project tsconfig

## Evidence commands
```bash
# Extension structure exists
ls editors/vscode/package.json editors/vscode/src/extension.ts
# Main project still builds
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
