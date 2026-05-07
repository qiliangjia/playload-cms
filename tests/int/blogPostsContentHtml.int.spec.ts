import { describe, expect, it } from 'vitest'
import { buildBlogPostContentHtml } from '../../src/collections/BlogPosts'

type BlogPostContentFixture = NonNullable<Parameters<typeof buildBlogPostContentHtml>[0]>

const textNode = (text: string, format = 0) => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

describe('blog post content HTML', () => {
  it('renders Payload internal blog links as locale-aware frontend URLs', () => {
    const content = {
      root: {
        children: [
          {
            children: [
              textNode('Read '),
              {
                children: [textNode('the setup guide', 1)],
                direction: 'ltr',
                fields: {
                  doc: {
                    relationTo: 'blogPosts',
                    value: { slug: 'fallback-landing-page-setup-guide' },
                  },
                  linkType: 'internal',
                  newTab: true,
                },
                format: '',
                id: 'link-1',
                indent: 0,
                type: 'link',
                version: 3,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    } as unknown as BlogPostContentFixture

    const html = buildBlogPostContentHtml(content, 'zh-CN')

    expect(html).toContain('href="/zh-CN/resources/blog/fallback-landing-page-setup-guide"')
    expect(html).not.toContain('href="#"')
  })
})
