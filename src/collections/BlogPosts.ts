import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import { buildPreviewUrl } from '../lib/previewUrl'

const triggerDeploy = () => {
  const url = process.env.CF_PAGES_DEPLOY_HOOK_URL
  if (!url) return
  fetch(url, { method: 'POST' }).catch(() => {})
}

export const BlogPosts: CollectionConfig = {
  slug: 'blogPosts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'slug', 'previewUrl', 'updatedAt'],
    components: {
      edit: {
        beforeDocumentControls: ['/components/MarkdownImportButton#MarkdownImportButton'],
      },
    },
  },
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
      ({ doc }) => {
        if (doc.content) {
          try {
            doc.contentHtml = convertLexicalToHTML({ data: doc.content })
          } catch {
            doc.contentHtml = ''
          }
        } else {
          doc.contentHtml = ''
        }
        doc.previewUrl = buildPreviewUrl('blog', doc.status, doc.slug) ?? ''
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
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              localized: true,
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
            {
              name: 'contentHtml',
              type: 'text',
              virtual: true,
              admin: { hidden: true },
            },
          ],
        },
        {
          label: 'Meta',
          fields: [
            {
              name: 'coverImage',
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'tags',
              type: 'array',
              fields: [{ name: 'tag', type: 'text', required: true }],
            },
          ],
        },
      ],
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
      admin: { position: 'sidebar' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: '留空时自动从标题生成（仅新建时）',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: { position: 'sidebar' },
    },
    {
      name: 'previewUrl',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: '按状态 + slug 拼接：draft 指向测试环境，published 指向生产环境',
        components: {
          Cell: '/components/PreviewUrlCell#PreviewUrlCell',
        },
      },
    },
  ],
}
