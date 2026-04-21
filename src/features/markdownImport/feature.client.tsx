'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'
import { MarkdownImportPlugin } from './MarkdownImportPlugin'

export const MarkdownImportFeatureClient = createClientFeature({
  plugins: [
    {
      Component: MarkdownImportPlugin,
      position: 'normal',
    },
  ],
})

export default MarkdownImportFeatureClient
