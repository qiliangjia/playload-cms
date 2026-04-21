import { createServerFeature } from '@payloadcms/richtext-lexical'

export const MarkdownImportFeature = createServerFeature({
  feature: {
    ClientFeature: '/features/markdownImport/feature.client#MarkdownImportFeatureClient',
  },
  key: 'markdownImport',
})
