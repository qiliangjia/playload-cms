import { describe, it, expect } from 'vitest'
import {
  getMissingCreateFields,
  getRequiredLocalizedFields,
  normalizeBlogPostData,
  resolveInheritedLocalizedFields,
} from '../../src/endpoints/cmsMcpFromMarkdown'

// The endpoint body is module-scoped inside the handler; extract the regex here
// to keep test coverage against the same rule.
const RELATIVE_IMAGE_PATTERN = /!\[[^\]]*]\((?!https?:\/\/|data:)[^)]+\)/

describe('cmsMcpFromMarkdown relative-image guard', () => {
  it('flags relative paths', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](./local/path.png)')).toBe(true)
    expect(RELATIVE_IMAGE_PATTERN.test('before ![alt](../foo.jpg) after')).toBe(true)
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](media/a.png)')).toBe(true)
  })
  it('passes absolute http(s) and data URLs', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](https://cms-r2.deepclick.com/media/a.png)')).toBe(
      false,
    )
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](http://example.com/a.png)')).toBe(false)
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](data:image/png;base64,AAA)')).toBe(false)
  })
  it('ignores non-image links', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('[text](./foo.md)')).toBe(false)
  })
})

describe('cmsMcpFromMarkdown data normalization', () => {
  it('accepts CLI-style nested data with the collection coverImage field', () => {
    const data = normalizeBlogPostData({
      data: {
        title: 'Launch notes',
        slug: 'launch-notes',
        category: 7,
        coverImage: 308,
      },
    })

    expect(data).toMatchObject({
      title: 'Launch notes',
      slug: 'launch-notes',
      category: 7,
      coverImage: 308,
    })
    expect(getMissingCreateFields(data)).toEqual([])
  })

  it('accepts coverImageId as an API alias for coverImage', () => {
    const data = normalizeBlogPostData({
      data: {
        title: 'Launch notes',
        slug: 'launch-notes',
        category: 7,
        coverImageId: 308,
      },
    })

    expect(data.coverImage).toBe(308)
    expect(data.coverImageId).toBeUndefined()
    expect(getMissingCreateFields(data)).toEqual([])
  })

  it('lets top-level fields override nested data for backwards compatibility', () => {
    const data = normalizeBlogPostData({
      title: 'Top-level title',
      status: 'published',
      meta: { title: 'SEO title' },
      data: {
        title: 'Nested title',
        slug: 'nested-slug',
      },
    })

    expect(data.title).toBe('Top-level title')
    expect(data.slug).toBe('nested-slug')
    expect(data.status).toBe('published')
    expect(data.meta).toEqual({ title: 'SEO title' })
  })
})

describe('getRequiredLocalizedFields', () => {
  it('collects required+localized fields, descending into tabs (matches BlogPosts config shape)', () => {
    const fields = [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Content',
            fields: [
              { name: 'title', type: 'text', required: true, localized: true },
              { name: 'excerpt', type: 'textarea', localized: true },
              { name: 'content', type: 'richText', localized: true },
            ],
          },
          {
            label: 'Meta',
            fields: [{ name: 'coverImage', type: 'upload', required: true, localized: true }],
          },
        ],
      },
      { name: 'status', type: 'select', required: true },
      { name: 'slug', type: 'text', required: true, localized: true },
      { name: 'category', type: 'relationship', required: true },
    ]

    expect(getRequiredLocalizedFields(fields).sort()).toEqual(['coverImage', 'slug', 'title'])
  })
})

describe('resolveInheritedLocalizedFields', () => {
  const REQUIRED = ['title', 'slug', 'coverImage']
  const defaultDoc = {
    title: 'English title',
    slug: 'english-slug',
    coverImage: { id: 318, url: 'https://x/cover.png' },
  }

  it('inherits required localized fields from the default locale when the target locale is empty', () => {
    // A fresh zh-CN write (target locale has no values yet) supplying only a body.
    const inherited = resolveInheritedLocalizedFields(
      REQUIRED,
      { content: {} },
      { title: null, slug: null, coverImage: null },
      defaultDoc,
    )

    expect(inherited).toEqual({
      title: 'English title',
      slug: 'english-slug',
      coverImage: 318, // relationship object flattened to id for the write
    })
  })

  it('never overrides fields the caller explicitly supplied', () => {
    const inherited = resolveInheritedLocalizedFields(
      REQUIRED,
      { title: '中文标题', slug: 'zh-slug', coverImage: 999 },
      { title: null, slug: null, coverImage: null },
      defaultDoc,
    )

    expect(inherited).toEqual({})
  })

  it('never overrides values the target locale already has', () => {
    const inherited = resolveInheritedLocalizedFields(
      REQUIRED,
      { content: {} },
      { title: '已有中文标题', slug: 'existing-zh', coverImage: 500 },
      defaultDoc,
    )

    expect(inherited).toEqual({})
  })

  it('only fills the fields that are actually missing', () => {
    const inherited = resolveInheritedLocalizedFields(
      REQUIRED,
      { title: '中文标题' },
      { title: null, slug: 'existing-zh', coverImage: null },
      defaultDoc,
    )

    expect(inherited).toEqual({ coverImage: 318 })
  })
})
