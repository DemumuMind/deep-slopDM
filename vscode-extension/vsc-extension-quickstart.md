# Deep Slop VS Code Extension — Quick Start

Welcome to the Deep Slop VS Code extension scaffold.

## What's in this folder

- `package.json` — Extension manifest and VS Code contribution points.
- `extension.js` — Main CommonJS entry point with the extension logic.
- `README.md` — Extension documentation for the marketplace.
- `.vscodeignore` — Excludes test files and source maps from the packaged extension.

## Get started

1. Open this folder in VS Code:
   ```bash
   code /mnt/c/Users/Romanchello/source/repo/Coder/AI_Debugger_Slop/vscode-extension
   ```
2. Press `F5` to open a new Extension Development Host window.
3. In the new window, run the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type:
   - `Deep Slop: Scan Active File`
   - `Deep Slop: Scan Workspace`
4. Make sure `deep-slop` is installed locally in the workspace or configure `deep-slop.cliPath` in VS Code settings.

## Make changes

- Edit `extension.js` to add new commands or tweak the diagnostic mapping.
- Update `package.json` when adding new commands, configuration, or activation events.

## Package and publish

```bash
npm install -g vsce
vsce package
vsce publish
```

## Explore the API

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Guides](https://code.visualstudio.com/api/extension-guides/overview)
