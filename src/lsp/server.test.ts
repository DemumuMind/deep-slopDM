import { describe, it, expect, vi } from 'vitest'
import { TextDocumentSyncKind } from 'vscode-languageserver/node'
import type { Connection } from 'vscode-languageserver/node'
import { createServer } from './server.js'

function makeConnection() {
  const onInitialize = vi.fn()
  const onInitialized = vi.fn()
  const onDidChangeConfiguration = vi.fn()
  const onCodeAction = vi.fn()
  const sendDiagnostics = vi.fn()
  const onDidOpenTextDocument = vi.fn()
  const onDidChangeTextDocument = vi.fn()
  const onDidCloseTextDocument = vi.fn()
  const onWillSaveTextDocument = vi.fn()
  const onWillSaveTextDocumentWaitUntil = vi.fn()
  const onDidSaveTextDocument = vi.fn()

  return {
    connection: {
      onInitialize,
      onInitialized,
      onDidChangeConfiguration,
      onCodeAction,
      sendDiagnostics,
      console: { warn: vi.fn() },
      workspace: { getConfiguration: vi.fn().mockResolvedValue({}) },
      client: { register: vi.fn() },
      onDidOpenTextDocument,
      onDidChangeTextDocument,
      onDidCloseTextDocument,
      onWillSaveTextDocument,
      onWillSaveTextDocumentWaitUntil,
      onDidSaveTextDocument,
    } as unknown as Connection,
    onInitialize,
    onCodeAction,
    onDidOpenTextDocument,
  }
}

describe('deep-slop-lsp server', () => {
  it('creates a server and registers handlers', () => {
    const { connection, onInitialize, onCodeAction, onDidOpenTextDocument } =
      makeConnection()
    createServer(connection)

    expect(onInitialize).toHaveBeenCalled()
    expect(onCodeAction).toHaveBeenCalled()
    expect(onDidOpenTextDocument).toHaveBeenCalled()
  })

  it('reports full sync, code actions and diagnostics on initialize', () => {
    const { connection, onInitialize } = makeConnection()
    createServer(connection)

    const handler = onInitialize.mock.calls[0][0]
    const result = handler({ rootUri: 'file:///home/sprite/project' })

    expect(result.capabilities.textDocumentSync.change).toBe(
      TextDocumentSyncKind.Full,
    )
    expect(result.capabilities.codeActionProvider).toBe(true)
    expect(result.capabilities.diagnosticProvider).toBeDefined()
    expect(result.serverInfo?.name).toBe('deep-slop-lsp')
  })
})
