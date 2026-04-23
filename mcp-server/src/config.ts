import os from 'node:os'
import path from 'node:path'

export const OAUTH_CLIENT_ID = 'cms-mcp'

export interface ServerConfig {
  // Base URL of the Payload CMS deployment, e.g. https://cms.deepclick.com
  baseUrl: string
  // Directory holding the local token cache; file mode 0600, dir mode 0700.
  tokenDir: string
  tokenFile: string
}

export const resolveConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const baseUrl = (env.CMS_MCP_BASE_URL || env.PAYLOAD_API_URL || '').replace(/\/$/, '')
  if (!baseUrl) {
    throw new Error(
      'CMS_MCP_BASE_URL must be set to the Payload CMS origin (e.g. https://cms.deepclick.com)',
    )
  }
  const home = env.HOME || os.homedir()
  const xdg = env.XDG_CONFIG_HOME || path.join(home, '.config')
  const tokenDir = path.join(xdg, 'playload-cms-mcp')
  return { baseUrl, tokenDir, tokenFile: path.join(tokenDir, 'token.json') }
}
