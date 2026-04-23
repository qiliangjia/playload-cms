import type { Payload } from 'payload'

export const OAUTH_CLIENT_ID = 'cms-mcp'
export const OAUTH_CODE_TTL_SECONDS = 300
export const OAUTH_TOKEN_TTL_SECONDS = 2592000
export const OAUTH_REDIRECT_URI_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/cb$/

export const isAllowedRedirectUri = (value: unknown): value is string =>
  typeof value === 'string' && OAUTH_REDIRECT_URI_PATTERN.test(value)

export const nowSeconds = () => Math.floor(Date.now() / 1000)

const textEncoder = new TextEncoder()

const base64UrlFromBytes = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const sha256Base64Url = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return base64UrlFromBytes(new Uint8Array(digest))
}

export const generateCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64UrlFromBytes(bytes)
}

export const verifyPkceS256 = async (
  codeVerifier: string,
  codeChallenge: string,
): Promise<boolean> => (await sha256Base64Url(codeVerifier)) === codeChallenge

export interface OAuthCodeRow {
  code: string
  user_id: number
  code_challenge: string
  code_challenge_method: string
  redirect_uri: string
  expires_at: number
  consumed: number
}

const getD1 = (payload: Payload): D1Database => {
  const db = (payload.db as unknown as { drizzle?: { $client?: D1Database } }).drizzle?.$client
  if (!db) throw new Error('D1 binding not available on payload.db')
  return db
}

export const storeCode = async (
  payload: Payload,
  row: Omit<OAuthCodeRow, 'consumed'>,
): Promise<void> => {
  const db = getD1(payload)
  await db
    .prepare(
      'INSERT INTO oauth_codes (code, user_id, code_challenge, code_challenge_method, redirect_uri, expires_at, consumed) VALUES (?, ?, ?, ?, ?, ?, 0)',
    )
    .bind(
      row.code,
      row.user_id,
      row.code_challenge,
      row.code_challenge_method,
      row.redirect_uri,
      row.expires_at,
    )
    .run()
}

export const consumeCode = async (
  payload: Payload,
  code: string,
): Promise<
  { ok: true; row: OAuthCodeRow } | { ok: false; reason: 'not_found' | 'consumed' | 'expired' }
> => {
  const db = getD1(payload)
  const row = await db
    .prepare('SELECT * FROM oauth_codes WHERE code = ?')
    .bind(code)
    .first<OAuthCodeRow>()
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.consumed === 1) return { ok: false, reason: 'consumed' }
  if (row.expires_at < nowSeconds()) {
    await db.prepare('DELETE FROM oauth_codes WHERE code = ?').bind(code).run()
    return { ok: false, reason: 'expired' }
  }
  const result = await db
    .prepare('UPDATE oauth_codes SET consumed = 1 WHERE code = ? AND consumed = 0')
    .bind(code)
    .run()
  if (result.meta.changes !== 1) return { ok: false, reason: 'consumed' }
  return { ok: true, row: { ...row, consumed: 1 } }
}

export interface MintedToken {
  token: string
  exp: number
}

export const mintPayloadJwt = async (
  user: { id: number | string; email: string; collection?: string },
  secret: string,
): Promise<MintedToken> => {
  const header = { alg: 'HS256', typ: 'JWT' }
  const iat = nowSeconds()
  const exp = iat + OAUTH_TOKEN_TTL_SECONDS
  const payload = {
    id: user.id,
    collection: user.collection ?? 'users',
    email: user.email,
    iat,
    exp,
  }
  const encode = (obj: unknown) => base64UrlFromBytes(textEncoder.encode(JSON.stringify(obj)))
  const unsigned = `${encode(header)}.${encode(payload)}`
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(unsigned))
  const token = `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`
  return { token, exp }
}
