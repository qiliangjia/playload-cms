import type { Endpoint } from 'payload'
import {
  convertMarkdownToLexical,
  defaultEditorConfig,
  defaultEditorFeatures,
  EXPERIMENTAL_TableFeature,
  sanitizeServerEditorConfig,
} from '@payloadcms/richtext-lexical'

// Use defaultEditorConfig with the table feature added so GFM tables
// (`| a | b |`) are parsed into lexical table nodes on import.
const importEditorConfig = {
  ...defaultEditorConfig,
  features: [...defaultEditorFeatures, EXPERIMENTAL_TableFeature()],
}

export const markdownToLexical: Endpoint = {
  method: 'post',
  path: '/markdown-to-lexical',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { markdown?: string }
    try {
      body = await req.json!()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
    if (!markdown.trim()) {
      return Response.json({ error: 'markdown required' }, { status: 400 })
    }

    const editorConfig = await sanitizeServerEditorConfig(importEditorConfig, req.payload.config)
    const lexical = convertMarkdownToLexical({ editorConfig, markdown })

    return Response.json({ lexical })
  },
}
