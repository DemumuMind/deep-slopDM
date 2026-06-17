#!/usr/bin/env node
import { server, startServer } from './server.js'
import { registerTools } from './tools.js'

registerTools(server)
startServer().catch(console.error)
