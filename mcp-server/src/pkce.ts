import crypto from 'node:crypto'

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const generateVerifier = (): string => base64url(crypto.randomBytes(32))

export const challengeFromVerifier = (verifier: string): string =>
  base64url(crypto.createHash('sha256').update(verifier).digest())

export const randomState = (): string => base64url(crypto.randomBytes(16))
