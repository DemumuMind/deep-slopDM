# Deep Slop for VS Code

AI slop detection directly inside VS Code. This extension runs the [deep-slop](https://github.com/nousresearch/deep-slop) CLI on the active file or entire workspace and surfaces the results as native VS Code diagnostics.

## Features

- **Scan Active File** — Run `deep-slop scan` on the currently open editor.
- **Scan Workspace** — Run `deep-slop scan` across the whole workspace.
- **Problems Panel** — Diagnostics are mapped to VS Code `DiagnosticCollection` so they appear in the Problems panel.
- **Output Channel** — Full JSON scan output is streamed to the `Deep Slop` output channel.
- **Status Bar** — A persistent status bar item shows the last score and turns red when it falls below your configured threshold.

## Commands

| Command | Title |
| --- | --- |
| `deep-slop.scanFile` | Deep Slop: Scan Active File |
| `deep-slop.scanWorkspace` | Deep Slop: Scan Workspace |

## Configuration

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `deep-slop.cliPath` | `string` | `""` | Path to the `deep-slop` CLI. If empty, the extension tries `./node_modules/.bin/deep-slop`. |
| `deep-slop.failBelow` | `number` | `70` | Score below which the status bar is highlighted as an error. |

## Requirements

- VS Code `^1.85.0`
- A working `deep-slop` CLI installed locally or globally, or set via `deep-slop.cliPath`.

## Screenshot

<!-- Replace with an actual screenshot before publishing: -->
<!-- ![Deep Slop status bar and diagnostics](images/screenshot.png) -->
