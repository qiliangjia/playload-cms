import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureInsideHome,
  resolveRelativeToMarkdown,
  rewriteInlineImages,
} from '../src/markdown.js'
import type { PayloadClient } from '../src/payloadClient.js'

const fakeClient = (uploads: Array<{ path: string; url: string }>): PayloadClient =>
  ({
    uploadMedia: async (p: string) => {
      const hit = uploads.find((u) => u.path === p)
      if (!hit) throw new Error(`unexpected upload: ${p}`)
      return { id: 1, url: hit.url }
    },
  }) as unknown as PayloadClient

describe('ensureInsideHome', () => {
  it('accepts paths inside $HOME', () => {
    expect(() => ensureInsideHome(path.join(os.homedir(), 'notes', 'a.png'))).not.toThrow()
  })

  it('rejects paths outside $HOME', () => {
    expect(() => ensureInsideHome('/etc/passwd')).toThrow(/outside the user's home directory/)
  })
})

describe('resolveRelativeToMarkdown', () => {
  it('passes http(s) URLs through unchanged', () => {
    expect(resolveRelativeToMarkdown('/tmp', 'https://example.com/a.png')).toBe(
      'https://example.com/a.png',
    )
  })

  it('passes data URIs through unchanged', () => {
    expect(resolveRelativeToMarkdown('/tmp', 'data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA',
    )
  })

  it('resolves relative paths against baseDir', () => {
    expect(resolveRelativeToMarkdown('/tmp/docs', './a.png')).toBe('/tmp/docs/a.png')
  })
})

describe('rewriteInlineImages', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.homedir(), '.cms-mcp-md-'))
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('leaves remote images untouched', async () => {
    const md = '# t\n\n![a](https://ex.com/a.png)\n'
    const out = await rewriteInlineImages(md, tmp, fakeClient([]))
    expect(out).toBe(md)
  })

  it('uploads local images and rewrites to the returned URL, preserving title', async () => {
    const p = path.join(tmp, 'a.png')
    await fs.writeFile(p, 'png')
    const md = `![a](${p} "hi")\n`
    const out = await rewriteInlineImages(
      md,
      tmp,
      fakeClient([{ path: p, url: 'https://cdn.example.com/a.png' }]),
    )
    expect(out).toBe('![a](https://cdn.example.com/a.png "hi")\n')
  })

  it('deduplicates identical local references', async () => {
    const p = path.join(tmp, 'b.png')
    await fs.writeFile(p, 'png')
    const md = `![x](${p})\n![y](${p})\n`
    let calls = 0
    const client = {
      uploadMedia: async () => {
        calls += 1
        return { id: 1, url: 'https://cdn.example.com/b.png' }
      },
    } as unknown as PayloadClient
    const out = await rewriteInlineImages(md, tmp, client)
    expect(calls).toBe(1)
    expect(out).toContain('![x](https://cdn.example.com/b.png)')
    expect(out).toContain('![y](https://cdn.example.com/b.png)')
  })

  it('throws when a local reference escapes $HOME', async () => {
    const md = '![a](/etc/passwd)\n'
    await expect(rewriteInlineImages(md, undefined, fakeClient([]))).rejects.toThrow(
      /outside the user's home directory/,
    )
  })
})
