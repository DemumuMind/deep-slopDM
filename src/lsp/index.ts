import { createConnection, ProposedFeatures } from 'vscode-languageserver/node'
import { createServer } from './server.js'

// ── LSP Entry Point ──────────────────────────────────────

const connection = createConnection(
  ProposedFeatures.all,
  process.stdin,
  process.stdout,
)

createServer(connection)
connection.listen()
