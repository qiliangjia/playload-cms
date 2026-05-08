import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ServerConfig } from './config.js'

const HASH_LENGTH = 12

const contentHash = (data: Buffer): string =>
  crypto.createHash('sha256').update(data).digest('hex').slice(0, HASH_LENGTH)

const splitFilename = (raw: string): { base: string; ext: string } => {
  const name = raw.trim() || 'image'
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

const HASH_SUFFIX_RE = new RegExp(`-[0-9a-f]{${HASH_LENGTH}}$`)

// Mirror of the server-side hook in src/collections/Media.ts so client and
// server agree on what filename a given file content will end up with.
const computeTargetFilename = (originalName: string, data: Buffer): string => {
  const { base, ext } = splitFilename(originalName)
  const cleanBase = base.replace(HASH_SUFFIX_RE, '') || 'image'
  return `${cleanBase}-${contentHash(data)}${ext}`
}

export class PayloadError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const extractMessage = (status: number, body: unknown): string => {
  if (isObject(body)) {
    const errors = (body as { errors?: unknown }).errors
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors
        .map((e) => {
          if (!isObject(e)) return String(e)
          const field = typeof e.field === 'string' ? e.field : ''
          const msg = typeof e.message === 'string' ? e.message : JSON.stringify(e)
          return field ? `${field}: ${msg}` : msg
        })
        .join('; ')
      return `${status}: ${parts}`
    }
    if (typeof (body as { message?: unknown }).message === 'string') {
      return `${status}: ${(body as { message: string }).message}`
    }
    if (typeof (body as { error?: unknown }).error === 'string') {
      return `${status}: ${(body as { error: string }).error}`
    }
  }
  return `${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
}

export class PayloadClient {
  constructor(
    private readonly cfg: ServerConfig,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async request(
    method: string,
    pathname: string,
    init: {
      query?: Record<string, string | number | undefined>
      body?: unknown
      form?: FormData
    } = {},
  ): Promise<unknown> {
    const url = new URL(this.cfg.baseUrl + pathname)
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const token = await this.getToken()
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    let body: BodyInit | undefined
    if (init.form) {
      body = init.form
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(init.body)
    }
    const res = await fetch(url, { method, headers, body })
    const text = await res.text()
    const parsed = text ? safeJson(text) : null
    if (!res.ok) {
      throw new PayloadError(res.status, parsed ?? text, extractMessage(res.status, parsed ?? text))
    }
    return parsed
  }

  get(pathname: string, query?: Record<string, string | number | undefined>): Promise<unknown> {
    return this.request('GET', pathname, { query })
  }
  post(pathname: string, body: unknown, query?: Record<string, string | number | undefined>) {
    return this.request('POST', pathname, { body, query })
  }
  patch(pathname: string, body: unknown, query?: Record<string, string | number | undefined>) {
    return this.request('PATCH', pathname, { body, query })
  }
  async postForm(pathname: string, form: FormData) {
    return this.request('POST', pathname, { form })
  }

  async uploadMedia(filePath: string, alt?: string): Promise<{ id: number; url: string }> {
    const absolute = path.resolve(filePath)
    const data = await fs.readFile(absolute)
    const originalName = path.basename(absolute)
    const targetFilename = computeTargetFilename(originalName, data)

    // Reuse an existing media doc when the content is byte-identical. The
    // server-side hook also produces `<base>-<hash>.<ext>` so the lookup key
    // is stable across clients.
    const existing = (await this.get('/api/media', {
      'where[filename][equals]': targetFilename,
      limit: 1,
    })) as { docs?: Array<{ id: number; url: string }> }
    const reused = existing.docs?.[0]
    if (reused) {
      return { id: reused.id, url: reused.url }
    }

    const form = new FormData()
    form.append('file', new Blob([data as unknown as BlobPart]), targetFilename)
    form.append('_payload', JSON.stringify({ alt: alt ?? originalName }))
    const resp = (await this.postForm('/api/media', form)) as { doc: { id: number; url: string } }
    return { id: resp.doc.id, url: resp.doc.url }
  }
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
