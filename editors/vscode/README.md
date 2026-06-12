# deep-slop — VS Code Extension

Deep AI slop detection inside VS Code. Powered by 12 AST-based analysis engines.

## Features

- Scan your entire workspace or the current file for AI-generated code quality issues
- Inline diagnostics with severity, rule ID, and help links
- Status bar showing the deep-slop quality score (0–100)
- Auto-scan on save (opt-in)
- Auto-scan on activation (opt-in)

## Install

### From VSIX

1. Download the `.vsix` file from releases
2. In VS Code, run **Extensions: Install from VSIX…** from the Command Palette
3. Select the downloaded file

### From Source

```bash
cd editors/vscode
npm install
npm run compile
# Then use F5 to launch the Extension Development Host
```

## Usage

- **Command Palette → deep-slop: Scan Workspace** — scan all files in the workspace
- **Command Palette → deep-slop: Scan Current File** — scan the active editor file
- **Status bar click** — runs a workspace scan

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `deep-slop.path` | string | `""` | Path to the `deep-slop` CLI binary. Leave empty to auto-detect from PATH. |
| `deep-slop.scanOnSave` | boolean | `false` | Automatically scan on every file save. |
| `deep-slop.autoScan` | boolean | `false` | Automatically scan the workspace when the extension activates. |

## Security

The `deep-slop.path` setting is read **only from user-level (Global) configuration**.
Workspace-level settings are ignored to prevent a malicious repository from redirecting
the extension to a trojanized binary.

## Score Colors

| Score | Color |
|-------|-------|
| ≥ 75  | Green |
| ≥ 50  | Yellow |
| < 50  | Red |

## Requirements

- VS Code 1.85+
- The `deep-slop` CLI installed and available on PATH, or its path set in `deep-slop.path`
