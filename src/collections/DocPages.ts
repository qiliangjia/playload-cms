import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildPreviewUrl } from '../lib/previewUrl'
import { triggerDeploy } from '../lib/triggerDeploy'
import { normalizeSlug } from '../lib/slug'
import { MarkdownImportFeature } from '../features/markdownImport/feature.server'

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
      ({ data }) => {
        normalizeSlug(data)
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
      async ({ doc, previousDoc }) => {
        await triggerDeploy(doc?.status, previousDoc?.status)
      },
    ],
    afterDelete: [
      async ({ doc }) => {
        await triggerDeploy(doc?.status, doc?.status)
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
              editor: lexicalEditor({
                features: ({ defaultFeatures }) => [...defaultFeatures, MarkdownImportFeature()],
              }),
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
        description: '只能包含 a-z、0-9、短横线；保存时会自动规范化。留空则从标题生成',
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
