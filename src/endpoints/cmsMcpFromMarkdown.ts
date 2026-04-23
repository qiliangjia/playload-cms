import type { Endpoint } from 'payload'
import { convertMarkdownToLexical, sanitizeServerEditorConfig } from '@payloadcms/richtext-lexical'
import { blogPostsMarkdownImportConfig } from '../features/blogPostsEditor'

type Mode = 'convert' | 'create' | 'update'
type LocaleCode = 'en' | 'zh-CN'

interface Body {
  mode?: Mode
  markdown?: string
  locale?: LocaleCode
  id?: number | string
  title?: string
  slug?: string
  category?: number | string
  coverImageId?: number | string
  excerpt?: string
}

const RELATIVE_IMAGE_PATTERN = /!\[[^\]]*]\((?!https?:\/\/|data:)[^)]+\)/

const json = (body: unknown, status = 200) => Response.json(body, { status })

export const cmsMcpFromMarkdown: Endpoint = {
  method: 'post',
  path: '/cms-mcp/from-markdown',
  handler: async (req) => {
    if (!req.user || req.user.collection !== 'users') {
      return json({ error: 'Unauthorized' }, 401)
    }

    let body: Body
    try {
      body = (await req.json!()) as Body
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    const mode = body.mode
    const markdown = typeof body.markdown === 'string' ? body.markdown : ''
    if (mode !== 'convert' && mode !== 'create' && mode !== 'update') {
      return json({ error: 'invalid_mode' }, 400)
    }
    if (!markdown.trim()) {
      return json({ error: 'markdown_required' }, 400)
    }
    if (RELATIVE_IMAGE_PATTERN.test(markdown)) {
      return json(
        {
          error: 'relative_image_url',
          message:
            'Inline image URLs must be absolute. Upload images via media_upload and rewrite URLs before sending.',
        },
        400,
      )
    }

    const editorConfig = await sanitizeServerEditorConfig(
      blogPostsMarkdownImportConfig,
      req.payload.config,
    )
    const lexical = convertMarkdownToLexical({ editorConfig, markdown })

    if (mode === 'convert') {
      return json({ lexical })
    }

    const locale = body.locale
    if (locale !== 'en' && locale !== 'zh-CN') {
      return json({ error: 'invalid_locale' }, 400)
    }

    if (mode === 'create') {
      if (
        !body.title ||
        !body.slug ||
        body.category === undefined ||
        body.coverImageId === undefined
      ) {
        return json(
          { error: 'missing_fields', fields: ['title', 'slug', 'category', 'coverImageId'] },
          400,
        )
      }
      try {
        const created = await req.payload.create({
          collection: 'blogPosts',
          locale,
          data: {
            title: body.title,
            slug: body.slug,
            content: lexical as unknown as Record<string, unknown>,
            category: body.category as number,
            coverImage: body.coverImageId as number,
            status: 'draft',
            ...(body.excerpt ? { excerpt: body.excerpt } : {}),
          },
          user: req.user,
          overrideAccess: false,
        })
        return json({ id: created.id, status: created.status ?? 'draft' })
      } catch (err) {
        return json({ error: 'create_failed', detail: serializeError(err) }, 400)
      }
    }

    // mode === 'update'
    if (body.id === undefined) {
      return json({ error: 'missing_id' }, 400)
    }
    try {
      const data: Record<string, unknown> = {
        content: lexical,
      }
      if (typeof body.title === 'string') data.title = body.title
      if (typeof body.slug === 'string') data.slug = body.slug
      if (typeof body.excerpt === 'string') data.excerpt = body.excerpt

      const updated = await req.payload.update({
        collection: 'blogPosts',
        id: body.id,
        locale,
        data,
        user: req.user,
        overrideAccess: false,
      })
      return json({ id: updated.id, status: updated.status ?? 'draft' })
    } catch (err) {
      return json({ error: 'update_failed', detail: serializeError(err) }, 400)
    }
  },
}

const serializeError = (err: unknown): unknown => {
  if (!err) return String(err)
  if (err instanceof Error) {
    const data = (err as Error & { data?: unknown }).data
    return { name: err.name, message: err.message, ...(data ? { data } : {}) }
  }
  return String(err)
}
