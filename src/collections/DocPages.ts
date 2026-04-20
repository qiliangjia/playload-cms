import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

const triggerDeploy = () => {
  const url = process.env.CF_PAGES_DEPLOY_HOOK_URL
  if (!url) return
  fetch(url, { method: 'POST' }).catch(() => {})
}

export const DocPages: CollectionConfig = {
  slug: 'docPages',
  admin: { useAsTitle: 'title' },
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
    {
      name: 'sidebarOrder',
      type: 'number',
      admin: { description: '侧边栏排序，数字越小越靠前' },
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
