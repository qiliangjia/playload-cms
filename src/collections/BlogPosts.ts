import type { CollectionConfig } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildPreviewUrl } from '../lib/previewUrl'
import { triggerDeploy } from '../lib/triggerDeploy'
import { normalizeSlug } from '../lib/slug'
import { MarkdownImportFeature } from '../features/markdownImport/feature.server'

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
        doc.previewUrl = buildPreviewUrl('blog', doc.status, doc.slug) ?? ''
        return doc
      },
    ],
    afterChange: [
      ({ doc, previousDoc }) => {
        triggerDeploy(doc?.status, previousDoc?.status)
      },
    ],
    afterDelete: [
      ({ doc }) => {
        triggerDeploy(doc?.status, doc?.status)
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
        description: '只能包含 a-z、0-9、短横线；保存时会自动规范化。留空则从标题生成',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: { position: 'sidebar' },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'industry-info',
      options: [
        { label: { en: 'Brand News', 'zh-CN': '品牌新闻' }, value: 'brand-news' },
        {
          label: { en: 'Product Tutorial', 'zh-CN': '产品教程' },
          value: 'product-tutorial',
        },
        {
          label: { en: 'Industry Info', 'zh-CN': '行业信息' },
          value: 'industry-info',
        },
        {
          label: { en: 'Going-Global Events', 'zh-CN': '出海活动' },
          value: 'going-global-events',
        },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: '勾选后会出现在博客首页大 Hero 位（建议同时只勾一篇）',
      },
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
