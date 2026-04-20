import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML, defaultHTMLConverters } from '@payloadcms/richtext-lexical'

const triggerDeploy = () => {
  const url = process.env.CF_PAGES_DEPLOY_HOOK_URL
  if (!url) return
  fetch(url, { method: 'POST' }).catch(() => {})
}

export const BlogPosts: CollectionConfig = {
  slug: 'blogPosts',
  admin: { useAsTitle: 'title' },
  access: { read: () => true },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // auto-slugify title → slug when slug is empty on create
        if (operation === 'create' && data.title && !data.slug) {
          data.slug = data.title
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
        }
        return data
      },
    ],
    afterRead: [
      async ({ doc }) => {
        if (doc.content) {
          try {
            doc.contentHtml = await convertLexicalToHTML({
              converters: defaultHTMLConverters,
              data: doc.content,
            })
          } catch {
            doc.contentHtml = ''
          }
        } else {
          doc.contentHtml = ''
        }
        return doc
      },
    ],
    afterChange: [
      () => {
        triggerDeploy()
      },
    ],
    afterDelete: [
      () => {
        triggerDeploy()
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      index: true,
      admin: { description: '留空时自动从标题生成（仅新建时）' },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
    },
    // contentHtml is a virtual field populated by the afterRead hook above
    {
      name: 'contentHtml',
      type: 'text',
      virtual: true,
      admin: { hidden: true },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'text',
    },
    {
      name: 'publishDate',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      defaultValue: 'draft',
      required: true,
    },
  ],
}
