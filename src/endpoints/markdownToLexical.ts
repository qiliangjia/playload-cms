import type { Endpoint } from 'payload'
import {
  convertMarkdownToLexical,
  defaultEditorConfig,
  sanitizeServerEditorConfig,
} from '@payloadcms/richtext-lexical'

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

    const editorConfig = await sanitizeServerEditorConfig(defaultEditorConfig, req.payload.config)
    const lexical = convertMarkdownToLexical({ editorConfig, markdown })

    return Response.json({ lexical })
  },
}
