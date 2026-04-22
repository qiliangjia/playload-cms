import type { CollectionConfig } from 'payload'
import { normalizeSlug } from '../lib/slug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'order', 'updatedAt'],
    baseFilter: () => ({ title: { exists: true } }),
  },
  access: { read: () => true },
  hooks: {
    beforeChange: [
      ({ data }) => {
        normalizeSlug(data)
        return data
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
      index: true,
      admin: {
        description: '只能包含 a-z、0-9、短横线；保存时会自动规范化。留空则从标题生成',
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: '数字越小越靠前',
      },
    },
  ],
}
