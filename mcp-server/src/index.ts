import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { resolveConfig, type ServerConfig } from './config.js'
import { ensureToken } from './oauth.js'
import { PayloadClient, PayloadError } from './payloadClient.js'
import { buildTools, type ToolContext, type ToolDef } from './tools.js'

const serializeError = (err: unknown): string => {
  if (err instanceof PayloadError) {
    return err.message
  }
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : JSON.stringify(err)
}

const toToolListEntry = (def: ToolDef) => ({
  name: def.name,
  description: def.description,
  inputSchema: def.inputSchema,
})

export const createServer = (cfg: ServerConfig): Server => {
  const baseDir = process.cwd()
  const tools = buildTools(baseDir)
  const toolMap = new Map<string, ToolDef>(tools.map((t) => [t.name, t]))
  const client = new PayloadClient(cfg, () => ensureToken(cfg))
  const ctx: ToolContext = { client }

  const server = new Server({ name: 'cms-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(toToolListEntry),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = toolMap.get(req.params.name)
    if (!def) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      }
    }
    try {
      const result = await def.handler((req.params.arguments ?? {}) as Record<string, unknown>, ctx)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: serializeError(err) }],
      }
    }
  })

  return server
}

export const run = async (): Promise<void> => {
  const cfg = resolveConfig()
  const server = createServer(cfg)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[cms-mcp] connected, base=${cfg.baseUrl}`)
}
