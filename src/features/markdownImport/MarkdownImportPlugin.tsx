'use client'

import React, { useEffect } from 'react'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'

export const EVENT_NAME = 'deepclick:md-import'

type ImportDetail = {
  state: Record<string, unknown>
  fieldPath: string
}

export const MarkdownImportPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ImportDetail>).detail
      if (!detail?.state) return

      try {
        const parsed = editor.parseEditorState(JSON.stringify(detail.state))
        editor.setEditorState(parsed)
      } catch (err) {
        console.error('[markdown-import] failed to apply state', err)
      }
    }

    window.addEventListener(EVENT_NAME, handler as EventListener)
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener)
  }, [editor])

  return null
}

export default MarkdownImportPlugin
