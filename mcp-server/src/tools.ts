import path from 'node:path'
import { ensureInsideHome, rewriteInlineImages } from './markdown.js'
import type { PayloadClient } from './payloadClient.js'

export interface ToolContext {
  client: PayloadClient
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${name} must be a non-empty string`)
  return v
}
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const optNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const optObj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined

// Map a Payload document id or slug to the numeric id used by `/api/blogPosts/:id`.
const resolvePostId = async (
  client: PayloadClient,
  identifier: string | number,
): Promise<string | number> => {
  if (typeof identifier === 'number') return identifier
  if (/^\d+$/.test(identifier)) return identifier
  const resp = (await client.get('/api/blogPosts', {
    'where[slug][equals]': identifier,
    limit: 1,
    depth: 0,
  })) as { docs: Array<{ id: number }> }
  if (!resp.docs || resp.docs.length === 0) {
    throw new Error(`blogPost not found by slug: ${identifier}`)
  }
  return resp.docs[0].id
}

export const buildTools = (baseDir: string | undefined): ToolDef[] => [
  {
    name: 'whoami',
    description: 'Return the currently authenticated CMS user.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, { client }) => client.get('/api/users/me'),
  },
  {
    name: 'category_list',
    description: 'List blog categories, optionally filtered by locale.',
    inputSchema: {
      type: 'object',
      properties: {
        locale: { type: 'string', description: 'e.g. en, zh' },
        limit: { type: 'number', default: 100 },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) =>
      client.get('/api/categories', {
        locale: optStr(args.locale),
        limit: optNum(args.limit) ?? 100,
      }),
  },
  {
    name: 'media_list',
    description: 'List recently uploaded media assets.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 20 },
        page: { type: 'number', default: 1 },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) =>
      client.get('/api/media', {
        limit: optNum(args.limit) ?? 20,
        page: optNum(args.page) ?? 1,
        sort: '-createdAt',
      }),
  },
  {
    name: 'media_upload',
    description:
      'Upload a local image file to the CMS media collection. The path must resolve inside the current user home directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to a local file.' },
        alt: { type: 'string', description: 'Alt text; defaults to the file name.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const p = str(args.path, 'path')
      const absolute = path.isAbsolute(p) ? p : path.resolve(baseDir ?? process.cwd(), p)
      ensureInsideHome(absolute)
      return client.uploadMedia(absolute, optStr(args.alt))
    },
  },
  {
    name: 'post_list',
    description: 'List blog posts with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'published'] },
        locale: { type: 'string' },
        limit: { type: 'number', default: 20 },
        page: { type: 'number', default: 1 },
        search: { type: 'string', description: 'Matches title.' },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const query: Record<string, string | number | undefined> = {
        limit: optNum(args.limit) ?? 20,
        page: optNum(args.page) ?? 1,
        locale: optStr(args.locale),
        draft: 'true',
        depth: 0,
      }
      const status = optStr(args.status)
      if (status) query['where[status][equals]'] = status
      const search = optStr(args.search)
      if (search) query['where[title][like]'] = search
      return client.get('/api/blogPosts', query)
    },
  },
  {
    name: 'post_get',
    description: 'Fetch a blog post by id or slug.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['string', 'number'] },
        slug: { type: 'string' },
        locale: { type: 'string' },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const id = args.id ?? args.slug
      if (!id) throw new Error('id or slug is required')
      const resolved = await resolvePostId(client, id as string | number)
      return client.get(`/api/blogPosts/${resolved}`, {
        locale: optStr(args.locale),
        draft: 'true',
        depth: 0,
      })
    },
  },
  {
    name: 'post_create',
    description:
      'Create a blog post from markdown. Inline relative images are uploaded to media and rewritten to the stored URL before the post is created. Status defaults to draft.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string' },
        locale: { type: 'string', description: 'Locale to write. Defaults to Payload default.' },
        data: {
          type: 'object',
          description:
            'Additional blogPosts fields (title, slug, excerpt, heroImage, category, status, etc.).',
        },
      },
      required: ['markdown'],
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const markdown = str(args.markdown, 'markdown')
      const rewritten = await rewriteInlineImages(markdown, baseDir, client)
      return client.post('/api/cms-mcp/from-markdown', {
        mode: 'create',
        markdown: rewritten,
        locale: optStr(args.locale),
        data: optObj(args.data) ?? {},
      })
    },
  },
  {
    name: 'post_update',
    description:
      'Update a blog post from markdown and/or a partial data patch. Writes are scoped to the provided locale.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['string', 'number'] },
        slug: { type: 'string' },
        markdown: { type: 'string' },
        locale: { type: 'string' },
        data: { type: 'object' },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const id = args.id ?? args.slug
      if (!id) throw new Error('id or slug is required')
      const resolved = await resolvePostId(client, id as string | number)
      const body: Record<string, unknown> = {
        mode: 'update',
        id: resolved,
        locale: optStr(args.locale),
        data: optObj(args.data) ?? {},
      }
      const markdown = optStr(args.markdown)
      if (markdown) body.markdown = await rewriteInlineImages(markdown, baseDir, client)
      return client.post('/api/cms-mcp/from-markdown', body)
    },
  },
  {
    name: 'post_publish',
    description: 'Publish a blog post (status=published).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['string', 'number'] },
        slug: { type: 'string' },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const id = args.id ?? args.slug
      if (!id) throw new Error('id or slug is required')
      const resolved = await resolvePostId(client, id as string | number)
      return client.patch(`/api/blogPosts/${resolved}`, { _status: 'published' })
    },
  },
  {
    name: 'post_unpublish',
    description: 'Unpublish a blog post (status=draft).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['string', 'number'] },
        slug: { type: 'string' },
      },
      additionalProperties: false,
    },
    handler: async (args, { client }) => {
      const id = args.id ?? args.slug
      if (!id) throw new Error('id or slug is required')
      const resolved = await resolvePostId(client, id as string | number)
      return client.patch(`/api/blogPosts/${resolved}`, { _status: 'draft' })
    },
  },
]
