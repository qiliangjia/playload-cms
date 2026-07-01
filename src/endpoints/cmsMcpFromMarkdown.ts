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
  author?: number | string
  coverImage?: number | string
  coverImageId?: number | string
  excerpt?: string
  status?: string
  publishDate?: string
  featured?: boolean
  meta?: Record<string, unknown>
  data?: Record<string, unknown>
}

const RELATIVE_IMAGE_PATTERN = /!\[[^\]]*]\((?!https?:\/\/|data:)[^)]+\)/

const json = (body: unknown, status = 200) => Response.json(body, { status })

const TOP_LEVEL_DATA_FIELDS = [
  'title',
  'slug',
  'category',
  'coverImage',
  'coverImageId',
  'excerpt',
  'author',
  'status',
  'publishDate',
  'featured',
  'meta',
] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasRequiredValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== ''

export const normalizeBlogPostData = (body: Body): Record<string, unknown> => {
  const data = isObject(body.data) ? { ...body.data } : {}

  for (const field of TOP_LEVEL_DATA_FIELDS) {
    const value = body[field]
    if (value !== undefined) data[field] = value
  }

  if (data.coverImage === undefined && data.coverImageId !== undefined) {
    data.coverImage = data.coverImageId
  }
  delete data.coverImageId

  return data
}

// Collect the names of fields that are both `required` and `localized`, walking
// the presentational nesting (tabs / rows) Payload allows. Writing a non-default
// locale must satisfy these for that locale or Payload rejects the whole update.
// Derived from the live collection config so it can't drift out of sync with
// BlogPosts.ts (e.g. adding another required+localized field).
type MaybeNestedField = {
  name?: string
  required?: boolean
  localized?: boolean
  fields?: unknown
  tabs?: unknown
}

export const getRequiredLocalizedFields = (fields: readonly unknown[]): string[] => {
  const names: string[] = []
  for (const raw of fields) {
    const field = raw as MaybeNestedField
    if (field.name && field.required && field.localized) names.push(field.name)
    if (Array.isArray(field.fields)) names.push(...getRequiredLocalizedFields(field.fields))
    if (Array.isArray(field.tabs)) {
      for (const tab of field.tabs as Array<{ fields?: unknown }>) {
        if (Array.isArray(tab.fields)) names.push(...getRequiredLocalizedFields(tab.fields))
      }
    }
  }
  return names
}

// A relationship/upload field comes back as an object at depth > 0 and as a bare
// id at depth 0; normalize to the id we can write back.
const toRelationId = (value: unknown): unknown =>
  isObject(value) && 'id' in value ? (value as { id: unknown }).id : value

// Given the caller's patch plus the document as it currently stands in the
// target locale (no fallback) and in the default locale, decide which required
// localized fields to inherit from the default locale. We only fill a field
// when the caller left it out AND the target locale has no value of its own, so
// existing per-locale overrides are never clobbered. This is the write-time
// complement to `localization.fallback: true` (which only fills empty fields on
// read): it lets a locale write behave like a translation layer over the
// default locale.
export const resolveInheritedLocalizedFields = (
  fields: readonly string[],
  patch: Record<string, unknown>,
  targetLocaleDoc: Record<string, unknown>,
  defaultLocaleDoc: Record<string, unknown>,
): Record<string, unknown> => {
  const inherited: Record<string, unknown> = {}
  for (const field of fields) {
    if (patch[field] !== undefined) continue
    if (hasRequiredValue(targetLocaleDoc[field])) continue
    const value = toRelationId(defaultLocaleDoc[field])
    if (hasRequiredValue(value)) inherited[field] = value
  }
  return inherited
}

export const getMissingCreateFields = (data: Record<string, unknown>): string[] => {
  const missing: string[] = []
  if (!hasRequiredValue(data.title)) missing.push('title')
  if (!hasRequiredValue(data.slug)) missing.push('slug')
  if (!hasRequiredValue(data.category)) missing.push('category')
  if (!hasRequiredValue(data.coverImage)) missing.push('coverImageId')
  return missing
}

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

    const data = normalizeBlogPostData(body)
    const hasMarkdown = Boolean(markdown.trim())
    const hasData = Object.keys(data).length > 0

    if ((mode === 'convert' || mode === 'create') && !hasMarkdown) {
      return json({ error: 'markdown_required' }, 400)
    }
    if (mode === 'update' && !hasMarkdown && !hasData) {
      return json({ error: 'markdown_or_data_required' }, 400)
    }
    if (hasMarkdown && RELATIVE_IMAGE_PATTERN.test(markdown)) {
      return json(
        {
          error: 'relative_image_url',
          message:
            'Inline image URLs must be absolute. Upload images via media_upload and rewrite URLs before sending.',
        },
        400,
      )
    }

    const lexical = hasMarkdown
      ? convertMarkdownToLexical({
          editorConfig: await sanitizeServerEditorConfig(
            blogPostsMarkdownImportConfig,
            req.payload.config,
          ),
          markdown,
        })
      : undefined

    if (mode === 'convert') {
      return json({ lexical })
    }

    const locale = body.locale
    if (locale !== 'en' && locale !== 'zh-CN') {
      return json({ error: 'invalid_locale' }, 400)
    }

    if (mode === 'create') {
      const missingFields = getMissingCreateFields(data)
      if (missingFields.length > 0) {
        return json({ error: 'missing_fields', fields: missingFields }, 400)
      }
      try {
        const createData = {
          ...data,
          content: lexical as unknown as {
            [k: string]: unknown
            root: {
              type: string
              children: { [k: string]: unknown; type: string; version: number }[]
              direction: 'ltr' | 'rtl'
              format: '' | 'left' | 'right' | 'center' | 'justify' | 'start' | 'end'
              indent: number
              version: number
            }
          },
          status: data.status ?? 'draft',
        }

        const created = await req.payload.create({
          collection: 'blogPosts',
          locale,
          data: createData as any,
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
      const updateData: Record<string, unknown> = { ...data }
      if (lexical) updateData.content = lexical

      // Writing a non-default locale must satisfy blogPosts' required localized
      // fields for that locale. When the caller omits one (e.g. a body-only
      // zh-CN translation), inherit it from the default locale instead of
      // failing. Only read the docs when something is actually missing — a full
      // payload can't inherit anything, so it skips the two lookups.
      const localization = req.payload.config.localization
      const defaultLocale = (localization ? localization.defaultLocale : 'en') as LocaleCode
      const requiredLocalizedFields = getRequiredLocalizedFields(
        req.payload.collections.blogPosts.config.fields,
      )
      const needsInheritance =
        locale !== defaultLocale &&
        requiredLocalizedFields.some((field) => updateData[field] === undefined)
      if (needsInheritance) {
        const [targetLocaleDoc, defaultLocaleDoc] = await Promise.all([
          req.payload.findByID({
            collection: 'blogPosts',
            id: body.id,
            locale,
            fallbackLocale: false,
            depth: 0,
          }),
          req.payload.findByID({
            collection: 'blogPosts',
            id: body.id,
            locale: defaultLocale,
            depth: 0,
          }),
        ])
        Object.assign(
          updateData,
          resolveInheritedLocalizedFields(
            requiredLocalizedFields,
            updateData,
            targetLocaleDoc as unknown as Record<string, unknown>,
            defaultLocaleDoc as unknown as Record<string, unknown>,
          ),
        )
      }

      const updated = await req.payload.update({
        collection: 'blogPosts',
        id: body.id,
        locale,
        data: updateData,
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
