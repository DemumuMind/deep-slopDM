import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { APP_VERSION } from '../version.js'

export const server = new McpServer({
  name: 'deep-slop',
  version: APP_VERSION,
})

export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
