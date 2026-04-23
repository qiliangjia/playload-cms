import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ServerConfig } from '../src/config.js'
import { PayloadClient, PayloadError } from '../src/payloadClient.js'

const cfg: ServerConfig = {
  baseUrl: 'https://cms.example.com',
  tokenDir: '/tmp/cms-mcp-test',
  tokenFile: '/tmp/cms-mcp-test/token.json',
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const getToken = async () => 'tok'

describe('PayloadClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends Authorization header with bearer token', async () => {
    const calls: Array<{ url: URL | RequestInfo; init?: RequestInit }> = []
    globalThis.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url, init })
      return jsonResponse(200, { ok: true })
    }) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken)
    const res = await client.get('/api/users/me')
    expect(res).toEqual({ ok: true })
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
  })

  it('appends query parameters, skipping undefined', async () => {
    let capturedUrl: string | undefined
    globalThis.fetch = vi.fn(async (url: URL | RequestInfo) => {
      capturedUrl = url instanceof URL ? url.toString() : String(url)
      return jsonResponse(200, [])
    }) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken)
    await client.get('/api/blogPosts', { limit: 10, locale: undefined, status: 'draft' })
    expect(capturedUrl).toContain('limit=10')
    expect(capturedUrl).toContain('status=draft')
    expect(capturedUrl).not.toContain('locale=')
  })

  it('surfaces Payload field-level validation errors verbatim', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        errors: [
          { field: 'title', message: 'Required' },
          { field: 'slug', message: 'Already in use' },
        ],
      }),
    ) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken)
    await expect(client.post('/api/blogPosts', {})).rejects.toMatchObject({
      status: 400,
      message: '400: title: Required; slug: Already in use',
    })
  })

  it('falls back to message field when errors array is absent', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { message: 'Unauthorized' }),
    ) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken)
    await expect(client.get('/api/users/me')).rejects.toMatchObject({
      status: 401,
      message: '401: Unauthorized',
    })
  })

  it('returns PayloadError instance with status and body', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(500, { message: 'boom' }),
    ) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken)
    let caught: unknown
    try {
      await client.get('/api/x')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PayloadError)
    const err = caught as PayloadError
    expect(err.status).toBe(500)
    expect(err.body).toEqual({ message: 'boom' })
  })
})
