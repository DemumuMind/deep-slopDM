import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Command } from 'commander'
import yaml from 'js-yaml'
import { loadConfig } from '../../config/index.js'
import { style } from '../../output/theme.js'

/** Config directory name */
const CONFIG_DIR = '.deep-slop'

/** Config file names to search for, in priority order */
const CONFIG_FILES = ['config.yml', 'config.yaml', 'config.json'] as const

/**
 * Search upward from `startDir` for a .deep-slop/ directory
 * containing config.yml, config.yaml, or config.json.
 * Returns the absolute path to the first config file found,
 * or `undefined` if none exists up to the filesystem root.
 */
function findConfigPath(startDir: string): string | undefined {
  let dir = startDir
  let prev = ''
  while (dir !== prev) {
    for (const name of CONFIG_FILES) {
      const candidate = join(dir, CONFIG_DIR, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    prev = dir
    dir = dirname(dir)
  }
  return undefined
}

/** Read the effective --json option from the parent command */
function wantsJson(command: Command): boolean {
  return command.optsWithGlobals().json ?? false
}

/** Serialize a config object to YAML or JSON */
function serializeConfig(config: Record<string, unknown>, asJson: boolean): string {
  if (asJson) {
    return JSON.stringify(config, null, 2)
  }
  return yaml.dump(config, { noRefs: true, sortKeys: true })
}

/** Print the resolved config to stdout */
async function showConfig(rootDir: string, asJson: boolean): Promise<void> {
  const config = loadConfig(rootDir) as unknown as Record<string, unknown>
  const configPath = findConfigPath(rootDir)

  process.stderr.write(`\n  deep-slop config: ${rootDir}\n`)
  if (configPath) {
    process.stderr.write(`  source: ${configPath}\n\n`)
  } else {
    process.stderr.write(`  source: defaults (no config file found)\n\n`)
  }

  console.log(serializeConfig(config, asJson))
}

/** Validate the resolved config and report the result */
async function validateConfig(rootDir: string, asJson: boolean): Promise<void> {
  const configPath = findConfigPath(rootDir)
  const startTime = Date.now()

  try {
    loadConfig(rootDir)
    const result = {
      valid: true,
      path: configPath ?? null,
      checked: configPath ?? 'defaults',
      elapsed: Date.now() - startTime,
    }

    if (asJson) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    process.stderr.write(`\n  ${style('success', '✔')} Config is valid\n`)
    if (configPath) {
      process.stderr.write(`  ${style('muted', configPath)}\n\n`)
    } else {
      process.stderr.write(`  ${style('muted', 'Using default config (no config file found)')}\n\n`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const result = {
      valid: false,
      path: configPath ?? null,
      error: message,
      elapsed: Date.now() - startTime,
    }

    if (asJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      process.stderr.write(`\n  ${style('danger', '✗')} Config validation failed\n`)
      process.stderr.write(`  ${style('muted', message)}\n\n`)
    }
    process.exit(1)
  }
}

/** Print the discovered config file path */
async function showConfigPath(rootDir: string): Promise<void> {
  const configPath = findConfigPath(rootDir)

  if (configPath) {
    console.log(configPath)
    return
  }

  process.stderr.write(`  ${style('muted', 'No .deep-slop/config file found')}\n`)
  process.exit(1)
}

export function register(program: Command): void {
  const configCmd = program
    .command('config')
    .helpGroup('Setup')
    .description('Show resolved deep-slop configuration')
    .argument('[path]', 'project directory', '.')
    .option('--json', 'Output as JSON')
    .action(async (path: string, opts: { json?: boolean }) => {
      await showConfig(resolve(path), opts.json ?? false)
    })

  configCmd
    .command('show')
    .description('Print resolved config after merging defaults, presets, and .deep-slop/config.yml')
    .argument('[path]', 'project directory', '.')
    .action(async (path: string, _opts: Record<string, unknown>, command: Command) => {
      await showConfig(resolve(path), wantsJson(command))
    })

  configCmd
    .command('validate')
    .description('Validate the resolved config and report errors')
    .argument('[path]', 'project directory', '.')
    .action(async (path: string, _opts: Record<string, unknown>, command: Command) => {
      await validateConfig(resolve(path), wantsJson(command))
    })

  configCmd
    .command('path')
    .description('Show the path to the discovered .deep-slop config file')
    .argument('[path]', 'project directory', '.')
    .action(async (path: string) => {
      await showConfigPath(resolve(path))
    })
}
