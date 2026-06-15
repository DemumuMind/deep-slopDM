# Deep Slop Plugin Authoring Guide

Deep Slop ships with 21 built-in analysis engines, but you can also add your own via a lightweight plugin system.  Plugins are plain JavaScript ESM files that live in `.deep-slop/plugins/` and export a single engine object.

## Table of Contents

- [Plugin Structure](#plugin-structure)
- [Engine Interface Reference](#engine-interface-reference)
- [Diagnostic Format](#diagnostic-format)
- [Installation](#installation)
- [Configuration](#configuration)
- [Testing Plugins](#testing-plugins)
- [Full Working Example](#full-working-example)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Plugin Structure

A plugin is a single `.js` or `.mjs` file that **default-exports** an object implementing the `Engine` interface.

```mjs
// .deep-slop/plugins/my-plugin.mjs
export default {
  name: 'my-engine',
  description: 'What this engine looks for',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context) {
    // Analyze files and return diagnostics
    return {
      engine: 'my-engine',
      diagnostics: [],
      elapsed: 0,
      skipped: false,
    }
  },

  // Optional: auto-fix selected diagnostics
  async fix(diagnostics, context) {
    return {
      fixed: 0,
      remaining: diagnostics,
      modifiedFiles: [],
    }
  },
}
```

Key points:

- Only `name`, `description`, `supportedLanguages`, and `run` are required.
- `name` must be unique across built-in engines **and** other plugins.
- `supportedLanguages` controls when the engine runs (see [Language list](#supported-languages)).
- Use only built-in Node modules or dependencies that are already installed in the project.  Plugins are not bundled with `npm install`.
- Prefer `node:fs/promises` and `node:path` over third-party helpers when possible.

## Engine Interface Reference

The TypeScript source of truth is `src/types/index.ts`.  A plugin engine must match this shape at runtime:

```ts
interface Engine {
  name: EngineName          // e.g. 'todo-counter'
  description: string       // shown in CLI / rules list
  supportedLanguages: Language[]
  run(context: EngineContext): Promise<EngineResult>
  fix?(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult>
}
```

### Supported languages

Valid values for `supportedLanguages` are:

`typescript`, `javascript`, `tsx`, `jsx`, `python`, `go`, `rust`, `ruby`, `php`, `java`, `csharp`, `swift`.

The engine is only executed when the project contains at least one of these languages.  If the engine supports "any language", list all of them.

### EngineContext

```ts
interface EngineContext {
  rootDirectory: string                     // project root
  languages: Language[]                     // detected languages
  frameworks: Framework[]                   // detected frameworks
  files?: string[]                          // files to scan (when --include or --changes)
  installedTools: Record<string, string | boolean>
  config: DeepSlopConfig                    // merged config.yml
  diffScope?: string                        // e.g. "3 changed vs origin/main"
}
```

### EngineResult

```ts
interface EngineResult {
  engine: EngineName
  diagnostics: Diagnostic[]
  elapsed: number
  skipped: boolean
  skipReason?: string
}
```

## Diagnostic Format

A `Diagnostic` is a single finding.  All fields are required except `suggestion` and `detail`.

```ts
interface Diagnostic {
  filePath: string
  engine: EngineName
  rule: string
  severity: 'error' | 'warning' | 'info' | 'suggestion'
  message: string
  help: string
  line: number
  column: number
  category: Category
  fixable: boolean
  suggestion?: Suggestion
  detail?: Record<string, unknown>
}
```

- `rule` should be namespaced: `<engine-name>/<rule-name>` (e.g. `todo-counter/todo-found`).
- `category` must be one of: `ai-slop`, `imports`, `dead-code`, `types`, `syntax`, `security`, `architecture`, `duplication`, `performance`, `i18n`, `config`, `style`.
- `severity` follows standard lint conventions.
- `fixable` and `suggestion` are optional but recommended when an auto-fix exists.

### Suggestion

```ts
interface Suggestion {
  type: 'replace' | 'insert' | 'delete' | 'refactor'
  text: string
  range?: {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
  }
  confidence: number
  reason: string
}
```

## Installation

1. Create the plugin directory if it does not exist:

   ```bash
   mkdir -p .deep-slop/plugins
   ```

2. Copy your `.mjs` file into that directory.

3. Run `deep-slop scan`.  Plugins are loaded automatically after the built-in engines.

Only `.js` and `.mjs` files are discovered.  Each file is treated as a standalone plugin.

## Configuration

Enable or disable a plugin the same way you disable a built-in engine.  Use the plugin's `name` in `.deep-slop/config.yml`:

```yaml
engines:
  todo-counter: true
  # another-plugin: false
```

You can also override rule severity for plugin rules:

```yaml
rules:
  todo-counter/todo-found: error
  todo-counter/todo-without-owner: info
```

Rules are loaded from the plugin at runtime, so you do not need to register them in the rule catalog.

## Testing Plugins

### Quick manual check

Create a temporary file and run it directly with Node:

```bash
node --input-type=module -e "
import engine from './.deep-slop/plugins/example-plugin.mjs'
console.log(engine.name, engine.supportedLanguages)
const result = await engine.run({
  rootDirectory: '.',
  languages: ['typescript'],
  frameworks: ['none'],
  installedTools: {},
  config: { exclude: ['node_modules', '.git', 'dist'] },
  files: ['./src/plugins/loader.ts']
})
console.log(result)
"
```

### With Vitest

Use a temporary directory and write plugin files inside a test case:

```ts
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const dir = join(tmpdir(), 'plugin-test')

describe('my-plugin', () => {
  it('finds TODOs', async () => {
    mkdirSync(dir, { recursive: true })
    const pluginPath = join(dir, 'todo.mjs')
    writeFileSync(pluginPath, `export default { ... }`)

    const mod = await import(pathToFileURL(pluginPath).href)
    const result = await mod.default.run({
      rootDirectory: dir,
      languages: ['typescript'],
      frameworks: ['none'],
      installedTools: {},
      config: { exclude: [] },
    })

    expect(result.engine).toBe('todo-counter')
    rmSync(dir, { recursive: true, force: true })
  })
})
```

### Debugging a live scan

Run the CLI with JSON output and inspect the plugin result:

```bash
pnpm build
node dist/deep-slop-bundled.js scan . --json | jq '.engines[] | select(.engine == "todo-counter")'
```

## Full Working Example

`.deep-slop/plugins/example-plugin.mjs` is a ready-to-use plugin that flags TODO and FIXME comments in any language.

```mjs
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ENGINE_NAME = 'todo-counter'

export default {
  name: ENGINE_NAME,
  description: 'Counts TODO and FIXME comments in any language',
  supportedLanguages: [
    'typescript', 'javascript', 'tsx', 'jsx', 'python',
    'go', 'rust', 'ruby', 'php', 'java', 'csharp', 'swift',
  ],

  async run(context) {
    const start = Date.now()
    const diagnostics = []
    const { rootDirectory, files: specifiedFiles, config } = context

    // Use the provided file list, or collect files from the project root.
    const files = specifiedFiles
      ? specifiedFiles
      : await collectFiles(rootDirectory, config.exclude ?? [])

    if (files.length === 0) {
      return {
        engine: ENGINE_NAME,
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No files found to scan',
      }
    }

    const markerPattern = /\b(TODO|FIXME)\b/gi

    for (const filePath of files) {
      if (!(await shouldRead(filePath))) continue
      let content
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const relativePath = relative(rootDirectory, filePath)
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        markerPattern.lastIndex = 0

        let match
        while ((match = markerPattern.exec(line)) !== null) {
          const marker = match[0]
          const text = line.trim()
          const after = text.slice(marker.length)
          const hasOwner = /\(@?\w+\)|@\w+/.test(after)

          diagnostics.push({
            filePath: relativePath,
            engine: ENGINE_NAME,
            rule: 'todo-counter/todo-found',
            severity: 'warning',
            message: `${marker} marker found`,
            help: 'Track this item in your issue tracker or resolve it before merging.',
            line: i + 1,
            column: match.index + 1,
            category: 'dead-code',
            fixable: false,
          })

          if (!hasOwner) {
            diagnostics.push({
              filePath: relativePath,
              engine: ENGINE_NAME,
              rule: 'todo-counter/todo-without-owner',
              severity: 'info',
              message: `${marker} marker does not have an owner`,
              help: `Add an owner so someone is responsible: ${marker}(@username) or ${marker} @username.`,
              line: i + 1,
              column: match.index + 1,
              category: 'dead-code',
              fixable: false,
            })
          }
        }
      }
    }

    return {
      engine: ENGINE_NAME,
      diagnostics,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}

async function collectFiles(rootDirectory, excludePatterns) {
  const files = []
  const alwaysExcluded = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.deep-slop'])

  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (alwaysExcluded.has(entry.name)) continue
      if (excludePatterns.some((p) => p && fullPath.includes(p))) continue

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  await walk(rootDirectory)
  return files
}

async function shouldRead(filePath) {
  try {
    const info = await stat(filePath)
    return info.isFile() && info.size <= 1024 * 1024
  } catch {
    return false
  }
}
```

This plugin emits two rules:

- `todo-counter/todo-found` — warning
- `todo-counter/todo-without-owner` — info

## Common Patterns

### Regex-based analysis

For line-based checks, split the file into lines and run a `RegExp` per line:

```mjs
const lines = content.split('\n')
for (let i = 0; i < lines.length; i++) {
  const match = /pattern/.exec(lines[i])
  if (match) {
    diagnostics.push({
      filePath: relativePath,
      engine: 'my-engine',
      rule: 'my-engine/my-rule',
      severity: 'warning',
      message: 'Description of the finding',
      help: 'How to fix it',
      line: i + 1,
      column: match.index + 1,
      category: 'style',
      fixable: false,
    })
  }
}
```

### AST analysis

You can import the `web-tree-sitter` helpers that deep-slop uses internally:

```mjs
import { parseFile } from './src/utils/tree-sitter.js'
```

Keep in mind this is an internal utility, so the API may change between releases.

### Multi-file checks

When an engine needs to compare multiple files (e.g. CSS selectors against HTML classes):

1. Use `context.files` if it is provided, otherwise collect from `context.rootDirectory`.
2. Build an in-memory index in one pass.
3. Run the rule against the index.

```mjs
const files = context.files ?? await collectFiles(context.rootDirectory, context.config.exclude)
const htmlFiles = files.filter((f) => f.endsWith('.html'))
const cssFiles = files.filter((f) => f.endsWith('.css'))

const classNames = new Set()
for (const file of htmlFiles) {
  const content = await readFile(file, 'utf-8')
  for (const match of content.matchAll(/class\s*=\s*["']([^"']+)["']/g)) {
    for (const cls of match[1].split(/\s+/)) {
      classNames.add(cls)
    }
  }
}

for (const file of cssFiles) {
  // Report selectors not present in classNames
}
```

### Skipping the engine

If the engine cannot run (e.g. missing required files), return a skipped result:

```mjs
return {
  engine: 'my-engine',
  diagnostics: [],
  elapsed: 0,
  skipped: true,
  skipReason: 'No configuration file found',
}
```

## Troubleshooting

### Plugin is not loaded

- Verify the file is inside `.deep-slop/plugins/` and has a `.js` or `.mjs` extension.
- Check the console for loader errors.
- Confirm the engine `name` is unique and does not conflict with a built-in engine.

### Plugin loads but never runs

- Make sure `supportedLanguages` includes at least one language detected in the project.
- Run `deep-slop doctor` or `deep-slop scan --json` to see which languages were detected.

### Import errors

- Plugins are ESM.  Use `import`/`export` syntax, not `require`/`module.exports`.
- Do not rely on packages that are not installed.  Plugins are loaded as-is from the project.

### Validation errors

`src/plugins/loader.ts` validates every plugin.  Common mistakes:

- Missing `export default { ... }`
- `name` or `description` is empty / missing
- `supportedLanguages` is not a non-empty array of strings
- `run` is not a function
- `fix` is provided but is not a function

### The plugin analyses itself

The example plugin excludes `.deep-slop` to avoid flagging its own `TODO` markers.  If you copy it, keep that exclusion or add `exclude` patterns in `config.yml`.

```yaml
exclude:
  - node_modules
  - .git
  - dist
  - .deep-slop
```
