import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import { buildPreviewUrl } from '../lib/previewUrl'

const triggerDeploy = () => {
  const url = process.env.CF_PAGES_DEPLOY_HOOK_URL
  if (!url) return
  fetch(url, { method: 'POST' }).catch(() => {})
}

export const DocPages: CollectionConfig = {
  slug: 'docPages',
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
        doc.previewUrl = buildPreviewUrl('doc', doc.status, doc.slug) ?? ''
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
      name: 'sidebarOrder',
      type: 'number',
      admin: {
        position: 'sidebar',
        description: '侧边栏排序，数字越小越靠前',
      },
    },
    {
      name: 'relatedProduct',
      type: 'select',
      options: [
        { label: 'Shield', value: 'shield' },
        { label: 'Audience Recovery', value: 'audience-recovery' },
        { label: 'Reflow Link', value: 'reflow-link' },
        { label: 'Re-engagement', value: 're-engagement' },
        { label: 'PWA Install', value: 'pwa-install' },
      ],
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
