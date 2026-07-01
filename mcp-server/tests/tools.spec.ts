import { describe, expect, it, vi } from 'vitest'
import { buildTools, type ToolContext } from '../src/tools.js'
import type { PayloadClient } from '../src/payloadClient.js'

const findTool = (name: string) => {
  const tool = buildTools(process.cwd()).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`missing tool: ${name}`)
  return tool
}

describe('tools post payloads', () => {
  it('sends create data both nested and flattened for endpoint compatibility', async () => {
    const post = vi.fn(async () => ({ ok: true }))
    const ctx = { client: { post } as unknown as PayloadClient } satisfies ToolContext

    await findTool('post_create').handler(
      {
        markdown: '# Title',
        locale: 'en',
        data: {
          title: 'Title',
          slug: 'title',
          category: 7,
          coverImage: 308,
        },
      },
      ctx,
    )

    expect(post).toHaveBeenCalledWith(
      '/api/cms-mcp/from-markdown',
      expect.objectContaining({
        mode: 'create',
        markdown: '# Title',
        locale: 'en',
        title: 'Title',
        slug: 'title',
        category: 7,
        coverImage: 308,
        coverImageId: 308,
        data: {
          title: 'Title',
          slug: 'title',
          category: 7,
          coverImage: 308,
        },
      }),
    )
  })

  it('sends update data without requiring markdown', async () => {
    const post = vi.fn(async () => ({ ok: true }))
    const ctx = { client: { post } as unknown as PayloadClient } satisfies ToolContext

    await findTool('post_update').handler(
      {
        id: 42,
        locale: 'en',
        data: {
          excerpt: 'Updated excerpt',
        },
      },
      ctx,
    )

    expect(post).toHaveBeenCalledWith(
      '/api/cms-mcp/from-markdown',
      expect.objectContaining({
        mode: 'update',
        id: 42,
        locale: 'en',
        excerpt: 'Updated excerpt',
        data: {
          excerpt: 'Updated excerpt',
        },
      }),
    )
  })

  it('publish sets the plain status field, not Payload _status', async () => {
    const patch = vi.fn(async () => ({ id: 42, status: 'published' }))
    const ctx = { client: { patch } as unknown as PayloadClient } satisfies ToolContext

    await findTool('post_publish').handler({ id: 42 }, ctx)

    expect(patch).toHaveBeenCalledWith('/api/blogPosts/42', { status: 'published' })
  })

  it('unpublish sets the plain status field, not Payload _status', async () => {
    const patch = vi.fn(async () => ({ id: 42, status: 'draft' }))
    const ctx = { client: { patch } as unknown as PayloadClient } satisfies ToolContext

    await findTool('post_unpublish').handler({ id: 42 }, ctx)

    expect(patch).toHaveBeenCalledWith('/api/blogPosts/42', { status: 'draft' })
  })
})
