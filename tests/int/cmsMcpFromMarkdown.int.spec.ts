import { describe, it, expect } from 'vitest'
import {
  getMissingCreateFields,
  normalizeBlogPostData,
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
