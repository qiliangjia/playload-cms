import { describe, it, expect } from 'vitest'
import {
  OAUTH_CLIENT_ID,
  OAUTH_TOKEN_TTL_SECONDS,
  generateCode,
  isAllowedRedirectUri,
  mintPayloadJwt,
  verifyPkceS256,
} from '@/lib/oauth'

const base64UrlDecodeToString = (input: string): string => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
  return atob(padded)
}

describe('oauth helpers', () => {
  it('allows only localhost /cb redirects', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:1234/cb')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:55555/cb')).toBe(true)
    expect(isAllowedRedirectUri('https://evil.example.com/cb')).toBe(false)
    expect(isAllowedRedirectUri('http://127.0.0.1/cb')).toBe(false)
    expect(isAllowedRedirectUri('http://localhost:1234/other')).toBe(false)
    expect(isAllowedRedirectUri('http://localhost:1234/cb?x=1')).toBe(false)
    expect(isAllowedRedirectUri(null as unknown as string)).toBe(false)
  })

  it('verifies PKCE S256 against the RFC 7636 test vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    await expect(verifyPkceS256(verifier, challenge)).resolves.toBe(true)
    await expect(verifyPkceS256(verifier + 'x', challenge)).resolves.toBe(false)
  })

  it('generates base64url-safe codes with >=256 bits of entropy', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 128; i += 1) {
      const code = generateCode()
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(code.length).toBeGreaterThanOrEqual(42)
      seen.add(code)
    }
    expect(seen.size).toBe(128)
  })

  it('mints a JWT with the expected header, claims, and 30-day exp', async () => {
    const secret = 'test-secret-please-ignore'
    const { token, exp } = await mintPayloadJwt(
      { id: 42, email: 'editor@example.com', collection: 'users' },
      secret,
    )
    const [headerPart, payloadPart, signaturePart] = token.split('.')
    expect(signaturePart).toMatch(/^[A-Za-z0-9_-]+$/)

    const header = JSON.parse(base64UrlDecodeToString(headerPart))
    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT' })

    const claims = JSON.parse(base64UrlDecodeToString(payloadPart))
    expect(claims).toMatchObject({ id: 42, email: 'editor@example.com', collection: 'users' })
    expect(typeof claims.iat).toBe('number')
    expect(typeof claims.exp).toBe('number')
    expect(claims.exp - claims.iat).toBe(OAUTH_TOKEN_TTL_SECONDS)
    expect(exp).toBe(claims.exp)
  })

  it('exposes the hardcoded client id', () => {
    expect(OAUTH_CLIENT_ID).toBe('cms-mcp')
  })
})
