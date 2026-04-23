import http from 'node:http'
import { AddressInfo } from 'node:net'
import { exec } from 'node:child_process'
import { OAUTH_CLIENT_ID, ServerConfig } from './config.js'
import { challengeFromVerifier, generateVerifier, randomState } from './pkce.js'
import { CachedToken, readToken, writeToken } from './tokenCache.js'

const openInBrowser = (url: string): void => {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) {
      console.error(`[cms-mcp] could not auto-open browser. Open manually: ${url}`)
    }
  })
}

const exchangeCode = async (
  cfg: ServerConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<CachedToken> => {
  const res = await fetch(`${cfg.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }
  const body = (await res.json()) as { access_token: string; expires_in: number }
  const expires_at = Math.floor(Date.now() / 1000) + body.expires_in
  return { token: body.access_token, expires_at }
}

export const loginFlow = async (cfg: ServerConfig): Promise<CachedToken> => {
  const verifier = generateVerifier()
  const challenge = challengeFromVerifier(verifier)
  const state = randomState()

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/cb') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Invalid callback.')
        server.close()
        reject(new Error('Invalid OAuth callback parameters'))
        return
      }
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          '<html><body style="font-family:system-ui;padding:48px;text-align:center">' +
            '<h2>CMS MCP authorized ✓</h2><p>You can close this tab.</p></body></html>',
        )
      server.close()

      const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cb`
      exchangeCode(cfg, code, verifier, redirectUri)
        .then(async (tok) => {
          await writeToken(cfg, tok)
          resolve(tok)
        })
        .catch(reject)
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      const redirectUri = `http://127.0.0.1:${port}/cb`
      const authorizeUrl = new URL('/oauth/authorize', cfg.baseUrl)
      authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID)
      authorizeUrl.searchParams.set('response_type', 'code')
      authorizeUrl.searchParams.set('redirect_uri', redirectUri)
      authorizeUrl.searchParams.set('code_challenge', challenge)
      authorizeUrl.searchParams.set('code_challenge_method', 'S256')
      authorizeUrl.searchParams.set('state', state)
      console.error(`[cms-mcp] open this URL to sign in: ${authorizeUrl.toString()}`)
      openInBrowser(authorizeUrl.toString())
    })

    server.on('error', reject)
  })
}

export const ensureToken = async (cfg: ServerConfig): Promise<string> => {
  const cached = await readToken(cfg)
  if (cached && cached.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return cached.token
  }
  const fresh = await loginFlow(cfg)
  return fresh.token
}
