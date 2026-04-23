import fs from 'node:fs/promises'
import path from 'node:path'
import type { ServerConfig } from './config.js'

export interface CachedToken {
  token: string
  expires_at: number
}

const isInsecureMode = (mode: number): boolean => (mode & 0o077) !== 0

export const readToken = async (cfg: ServerConfig): Promise<CachedToken | null> => {
  try {
    const buf = await fs.readFile(cfg.tokenFile, 'utf8')
    const parsed = JSON.parse(buf) as CachedToken
    if (typeof parsed.token !== 'string' || typeof parsed.expires_at !== 'number') return null
    return parsed
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export const assertSecureDir = async (cfg: ServerConfig): Promise<void> => {
  const parent = path.dirname(cfg.tokenDir)
  try {
    const stat = await fs.stat(cfg.tokenDir)
    if (isInsecureMode(stat.mode)) {
      throw new Error(
        `Refusing to use ${cfg.tokenDir}: directory is group- or world-accessible. ` +
          `Run: chmod 700 ${cfg.tokenDir}`,
      )
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    await fs.mkdir(parent, { recursive: true })
    await fs.mkdir(cfg.tokenDir, { mode: 0o700 })
  }
}

export const writeToken = async (cfg: ServerConfig, token: CachedToken): Promise<void> => {
  await assertSecureDir(cfg)
  const tmp = `${cfg.tokenFile}.tmp`
  await fs.writeFile(tmp, JSON.stringify(token), { mode: 0o600 })
  await fs.rename(tmp, cfg.tokenFile)
  await fs.chmod(cfg.tokenFile, 0o600)
}

export const clearToken = async (cfg: ServerConfig): Promise<void> => {
  try {
    await fs.unlink(cfg.tokenFile)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
