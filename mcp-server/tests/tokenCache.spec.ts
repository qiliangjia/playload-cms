import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerConfig } from '../src/config.js'
import { assertSecureDir, clearToken, readToken, writeToken } from '../src/tokenCache.js'

const mkTmpCfg = async (): Promise<ServerConfig> => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-mcp-tokencache-'))
  const tokenDir = path.join(base, 'playload-cms-mcp')
  return { baseUrl: 'http://test', tokenDir, tokenFile: path.join(tokenDir, 'token.json') }
}

describe('tokenCache', () => {
  let cfg: ServerConfig

  beforeEach(async () => {
    cfg = await mkTmpCfg()
  })

  afterEach(async () => {
    await fs.rm(path.dirname(cfg.tokenDir), { recursive: true, force: true })
  })

  it('returns null when the token file is absent', async () => {
    const got = await readToken(cfg)
    expect(got).toBeNull()
  })

  it('round-trips a token with mode 0600 and dir mode 0700', async () => {
    await writeToken(cfg, { token: 'abc', expires_at: 9999999999 })
    const dirStat = await fs.stat(cfg.tokenDir)
    expect(dirStat.mode & 0o777).toBe(0o700)
    const fileStat = await fs.stat(cfg.tokenFile)
    expect(fileStat.mode & 0o777).toBe(0o600)
    const got = await readToken(cfg)
    expect(got).toEqual({ token: 'abc', expires_at: 9999999999 })
  })

  it('refuses to use a group- or world-accessible token directory', async () => {
    await fs.mkdir(cfg.tokenDir, { recursive: true, mode: 0o755 })
    await fs.chmod(cfg.tokenDir, 0o755)
    await expect(assertSecureDir(cfg)).rejects.toThrow(/group- or world-accessible/)
  })

  it('returns null when the cached JSON is malformed', async () => {
    await fs.mkdir(cfg.tokenDir, { recursive: true, mode: 0o700 })
    await fs.writeFile(cfg.tokenFile, JSON.stringify({ token: 1, expires_at: 'no' }), {
      mode: 0o600,
    })
    const got = await readToken(cfg)
    expect(got).toBeNull()
  })

  it('clearToken is a noop when the file does not exist', async () => {
    await expect(clearToken(cfg)).resolves.toBeUndefined()
  })
})
