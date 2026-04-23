import { describe, expect, it } from 'vitest'
import { challengeFromVerifier, generateVerifier, randomState } from '../src/pkce.js'

describe('pkce', () => {
  it('generates base64url verifiers with no padding', () => {
    const v = generateVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(v.length).toBeGreaterThanOrEqual(43)
  })

  it('produces distinct verifiers across calls', () => {
    const a = generateVerifier()
    const b = generateVerifier()
    expect(a).not.toBe(b)
  })

  it('matches the RFC 7636 S256 test vector', () => {
    // Appendix B of RFC 7636.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    expect(challengeFromVerifier(verifier)).toBe(expected)
  })

  it('produces distinct states', () => {
    const a = randomState()
    const b = randomState()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
