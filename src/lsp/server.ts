import { fileURLToPath } from 'node:url'
import { extname, relative } from 'node:path'
import {
  TextDocuments,
  TextDocumentSyncKind,
  CodeActionKind,
  type Connection,
  type InitializeParams,
  type InitializeResult,
  type CodeActionParams,
  type CodeAction,
  type Diagnostic as LSPDiagnostic,
} from 'vscode-languageserver/node'
import type {
  Diagnostic,
  DeepSlopConfig,
  Engine,
  EngineContext,
  EngineName,
  Framework,
  Language,
} from '../types/index.js'
import { DEFAULT_CONFIG } from '../types/index.js'
import { ENGINE_REGISTRY } from '../engines/orchestrator.js'
import { loadConfig } from '../config/index.js'
import { applyRuleSeverities } from '../scoring/rule-overrides.js'
import { loadIgnoreFile, applySuppressDirectives } from '../utils/suppress.js'
import { detectFrameworks, detectInstalledLinters } from '../utils/discover.js'
import { APP_VERSION } from '../version.js'
import { toLspDiagnostic } from './diagnostics.js'
import { toCodeActions } from './code-actions.js'

// ── Document Model ──────────────────────────────────────

interface SimpleTextDocument {
  uri: string
  languageId: string
  version: number
  content: string
}

// ── File Extension to Language Mapping ──────────────────

const EXT_TO_LANG: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.cs': 'csharp',
  '.swift': 'swift',
}

function getLanguageFromPath(filePath: string): Language | null {
  return EXT_TO_LANG[extname(filePath)] ?? null
}

// ── Workspace Root Resolution ───────────────────────────

function resolveRoot(params: InitializeParams): string {
  if (params.rootUri) {
    return fileURLToPath(params.rootUri)
  }
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    return fileURLToPath(params.workspaceFolders[0].uri)
  }
  if (params.rootPath) {
    return params.rootPath
  }
  return process.cwd()
}

// ── Single File Scanning ────────────────────────────────

async function runSingleFileScan(
  context: EngineContext,
  content: string,
): Promise<Diagnostic[]> {
  const filePath = context.files?.[0]
  if (!filePath) {
    return []
  }

  const relPath = relative(context.rootDirectory, filePath)
  const fileContents = new Map<string, string>([[relPath, content]])
  const all: Diagnostic[] = []

  for (const [name, loader] of Object.entries(ENGINE_REGISTRY)) {
    if (context.config.engines[name as EngineName] === false) {
      continue
    }

    let engine: Engine
    try {
      engine = await loader()
    } catch {
      continue
    }

    if (!engine.supportedLanguages.some((l) => context.languages.includes(l))) {
      continue
    }

    try {
      const result = await engine.run(context)
      all.push(...result.diagnostics)
    } catch {
      // Single engine failures should not break the whole request.
    }
  }

  let diagnostics = applyRuleSeverities(all, context.config.rules || {})
  const globallySuppressed = new Set(loadIgnoreFile(context.rootDirectory))
  const { filtered } = applySuppressDirectives(
    diagnostics,
    fileContents,
    globallySuppressed,
  )
  return filtered.filter((d) => d.filePath === relPath)
}

// ── Server Factory ──────────────────────────────────────

export function createServer(connection: Connection): void {
  const diagnosticsByUri = new Map<string, LSPDiagnostic[]>()
  const deepDiagnosticsByUri = new Map<string, Diagnostic[]>()

  let rootDirectory = process.cwd()
  let config: DeepSlopConfig = DEFAULT_CONFIG
  let frameworks: Framework[] = []
  let installedTools: Record<string, string | boolean> = {}

  const documents = new TextDocuments<SimpleTextDocument>({
    create(
      uri: string,
      languageId: string,
      version: number,
      content: string,
    ): SimpleTextDocument {
      return { uri, languageId, version, content }
    },
    update(
      document: SimpleTextDocument,
      changes: { text?: string }[],
      version: number,
    ): SimpleTextDocument {
      let content = document.content
      for (const change of changes) {
        if (change.text !== undefined) {
          content = change.text
        }
      }
      return { ...document, version, content }
    },
  })

  documents.listen(connection)

  async function refreshConfig() {
    try {
      config = loadConfig(rootDirectory)
    } catch (e) {
      connection.console.warn(
        `Failed to load deep-slop config: ${e instanceof Error ? e.message : String(e)}`,
      )
      config = DEFAULT_CONFIG
    }

    try {
      const overrides =
        await connection.workspace.getConfiguration({ section: 'deep-slop' })
      if (overrides && typeof overrides === 'object') {
        config = {
          ...config,
          ...(overrides as Partial<DeepSlopConfig>),
        } as DeepSlopConfig
      }
    } catch {
      // Client does not support workspace/configuration.
    }
  }

  async function detectInstalledTools(): Promise<
    Record<string, string | boolean>
  > {
    const tools = await detectInstalledLinters(rootDirectory).catch(() => [])
    const map: Record<string, string | boolean> = {}
    for (const tool of tools) {
      map[tool] = true
    }
    return map
  }

  async function scanDocument(document: SimpleTextDocument): Promise<
    Diagnostic[]
  > {
    const absPath = fileURLToPath(document.uri)
    const language = getLanguageFromPath(absPath)
    if (!language) {
      return []
    }

    const context: EngineContext = {
      rootDirectory,
      languages: [language],
      frameworks,
      files: [absPath],
      installedTools,
      config,
    }

    return runSingleFileScan(context, document.content)
  }

  async function publishDiagnostics(document: SimpleTextDocument) {
    const dsDiagnostics = await scanDocument(document)
    const lspDiagnostics = dsDiagnostics.map((d) =>
      toLspDiagnostic(d, document.uri),
    )

    deepDiagnosticsByUri.set(document.uri, dsDiagnostics)
    diagnosticsByUri.set(document.uri, lspDiagnostics)

    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: lspDiagnostics,
    })
  }

  function resolveDeepDiagnostic(
    lspDiag: LSPDiagnostic,
    dsDiagnostics: Diagnostic[],
  ): Diagnostic | undefined {
    if (
      lspDiag.data &&
      typeof lspDiag.data === 'object' &&
      (lspDiag.data as Diagnostic).rule
    ) {
      return lspDiag.data as Diagnostic
    }

    return dsDiagnostics.find((d) => {
      const code =
        typeof lspDiag.code === 'string'
          ? lspDiag.code
          : String(lspDiag.code)
      return (
        d.rule === code &&
        d.message === lspDiag.message &&
        d.line === lspDiag.range.start.line + 1
      )
    })
  }

  // ── Handlers ──────────────────────────────────────────────

  connection.onInitialize(
    (params: InitializeParams): InitializeResult => {
      rootDirectory = resolveRoot(params)

      return {
        capabilities: {
          textDocumentSync: {
            openClose: true,
            change: TextDocumentSyncKind.Full,
          },
          codeActionProvider: true,
          diagnosticProvider: {
            identifier: 'deep-slop',
            interFileDependencies: false,
            workspaceDiagnostics: false,
          },
        },
        serverInfo: {
          name: 'deep-slop-lsp',
          version: APP_VERSION,
        },
      }
    },
  )

  connection.onInitialized(async () => {
    await refreshConfig()
    frameworks = await detectFrameworks(rootDirectory).catch(() => [])
    installedTools = await detectInstalledTools()
  })

  connection.onDidChangeConfiguration(async () => {
    await refreshConfig()
    for (const doc of documents.all()) {
      await publishDiagnostics(doc)
    }
  })

  documents.onDidOpen(async (event) => {
    await publishDiagnostics(event.document)
  })

  documents.onDidSave(async (event) => {
    await publishDiagnostics(event.document)
  })

  connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const uri = params.textDocument.uri
    const dsDiagnostics = deepDiagnosticsByUri.get(uri) ?? []
    const actions: CodeAction[] = []

    for (const lspDiag of params.context.diagnostics) {
      const ds = resolveDeepDiagnostic(lspDiag, dsDiagnostics)
      if (!ds) {
        continue
      }

      const fixes = toCodeActions(ds, uri)
      for (const action of fixes) {
        action.diagnostics = [lspDiag]
        action.kind = CodeActionKind.QuickFix
        actions.push(action)
      }
    }

    return actions
  })
}
