import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ServerConfig } from '../src/config.js'
import { makeClient, PayloadClient, PayloadError } from '../src/payloadClient.js'

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

  it('sends Payload API-Key Authorization header when scheme is apiKey', async () => {
    const calls: Array<{ init?: RequestInit }> = []
    globalThis.fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ init })
      return jsonResponse(200, { ok: true })
    }) as unknown as typeof fetch
    const client = new PayloadClient(cfg, getToken, 'apiKey')
    await client.get('/api/users/me')
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('users API-Key tok')
  })

  it('makeClient prefers CMS_API_TOKEN (API-Key) over OAuth', async () => {
    const prev = process.env.CMS_API_TOKEN
    process.env.CMS_API_TOKEN = 'svc-key'
    try {
      const calls: Array<{ init?: RequestInit }> = []
      globalThis.fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
        calls.push({ init })
        return jsonResponse(200, { ok: true })
      }) as unknown as typeof fetch
      const client = makeClient(cfg, async () => {
        throw new Error('OAuth must not run when CMS_API_TOKEN is set')
      })
      await client.get('/api/users/me')
      const headers = calls[0].init!.headers as Record<string, string>
      expect(headers.Authorization).toBe('users API-Key svc-key')
    } finally {
      if (prev === undefined) delete process.env.CMS_API_TOKEN
      else process.env.CMS_API_TOKEN = prev
    }
  })

  it('makeClient falls back to OAuth bearer when CMS_API_TOKEN is absent', async () => {
    const prev = process.env.CMS_API_TOKEN
    delete process.env.CMS_API_TOKEN
    try {
      const calls: Array<{ init?: RequestInit }> = []
      globalThis.fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
        calls.push({ init })
        return jsonResponse(200, { ok: true })
      }) as unknown as typeof fetch
      const client = makeClient(cfg, async () => 'oauth-tok')
      await client.get('/api/users/me')
      const headers = calls[0].init!.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer oauth-tok')
    } finally {
      if (prev !== undefined) process.env.CMS_API_TOKEN = prev
    }
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

  it('uploadMedia hashes content into the filename and reuses an existing doc', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-mcp-upload-'))
    const file = path.join(dir, 'image.png')
    const bytes = Buffer.from('hello-deepclick')
    await fs.writeFile(file, bytes)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const expectedFilename = `image-${hash}.png`

    const calls: Array<{ url: string; method?: string }> = []
    globalThis.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const u = url instanceof URL ? url.toString() : String(url)
      calls.push({ url: u, method: init?.method })
      // Lookup hits before any POST; pretend the doc already exists.
      return jsonResponse(200, {
        docs: [{ id: 42, url: `https://cdn/${expectedFilename}` }],
      })
    }) as unknown as typeof fetch

    const client = new PayloadClient(cfg, getToken)
    const res = await client.uploadMedia(file)
    expect(res).toEqual({ id: 42, url: `https://cdn/${expectedFilename}` })

    // Only the lookup should have fired; no upload POST when reusing.
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toContain(`where%5Bfilename%5D%5Bequals%5D=${expectedFilename}`)

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('uploadMedia uploads with the hashed filename when no existing doc matches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-mcp-upload-'))
    const file = path.join(dir, 'screenshot.png')
    const bytes = Buffer.from('different-bytes')
    await fs.writeFile(file, bytes)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const expectedFilename = `screenshot-${hash}.png`

    let postedFilename: string | undefined
    globalThis.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const u = url instanceof URL ? url.toString() : String(url)
      if (init?.method === 'POST' && init.body instanceof FormData) {
        const f = init.body.get('file') as File
        postedFilename = f.name
        return jsonResponse(201, { doc: { id: 99, url: `https://cdn/${expectedFilename}` } })
      }
      return jsonResponse(200, { docs: [] })
    }) as unknown as typeof fetch

    const client = new PayloadClient(cfg, getToken)
    const res = await client.uploadMedia(file, 'alt text')
    expect(res).toEqual({ id: 99, url: `https://cdn/${expectedFilename}` })
    expect(postedFilename).toBe(expectedFilename)

    await fs.rm(dir, { recursive: true, force: true })
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
