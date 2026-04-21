'use client'

import React, { useCallback, useState } from 'react'
import { Button, Modal, useField, useModal } from '@payloadcms/ui'

const MODAL_SLUG = 'markdown-import-modal'
const EVENT_NAME = 'deepclick:md-import'

type ContentFieldValue = Record<string, unknown> | undefined

export const MarkdownImportButton: React.FC = () => {
  const { openModal, closeModal } = useModal()
  const { value } = useField<ContentFieldValue>({ path: 'content' })

  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = useCallback(() => {
    setMarkdown('')
    setError(null)
    openModal(MODAL_SLUG)
  }, [openModal])

  const handleClose = useCallback(() => {
    closeModal(MODAL_SLUG)
  }, [closeModal])

  const convert = useCallback(async (): Promise<Record<string, unknown> | null> => {
    const trimmed = markdown.trim()
    if (!trimmed) {
      setError('Markdown 内容为空')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/markdown-to-lexical', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: trimmed }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body?.error ?? `请求失败 (${res.status})`)
        return null
      }
      const body = (await res.json()) as { lexical?: Record<string, unknown> }
      if (!body.lexical) {
        setError('响应格式错误')
        return null
      }
      return body.lexical
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
      return null
    } finally {
      setLoading(false)
    }
  }, [markdown])

  const dispatchImport = useCallback((state: Record<string, unknown>) => {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { state, fieldPath: 'content' },
      }),
    )
  }, [])

  const handleReplace = useCallback(async () => {
    const lexical = await convert()
    if (!lexical) return
    dispatchImport(lexical)
    handleClose()
  }, [convert, dispatchImport, handleClose])

  const handleAppend = useCallback(async () => {
    const lexical = await convert()
    if (!lexical) return
    const nextRoot = (lexical as { root?: { children?: unknown[] } }).root
    const currentRoot = (value as { root?: { children?: unknown[] } } | undefined)?.root
    const merged = {
      ...lexical,
      root: {
        ...(nextRoot ?? {}),
        children: [...(currentRoot?.children ?? []), ...(nextRoot?.children ?? [])],
      },
    }
    dispatchImport(merged)
    handleClose()
  }, [convert, dispatchImport, value, handleClose])

  return (
    <React.Fragment>
      <Button type="button" buttonStyle="secondary" size="small" onClick={handleOpen}>
        从 Markdown 导入
      </Button>

      <Modal slug={MODAL_SLUG} className="markdown-import-modal">
        <div
          style={{
            background: 'var(--theme-elevation-0)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            padding: 24,
            width: 'min(720px, 90vw)',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>从 Markdown 导入</h3>
          <p style={{ margin: 0, color: 'var(--theme-elevation-600)', fontSize: 13 }}>
            将 Markdown 粘贴到下方。导入会写入当前语言环境 (locale 由顶部切换器决定)。
          </p>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="# 标题&#10;&#10;正文..."
            rows={16}
            style={{
              width: '100%',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 13,
              padding: 12,
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
              background: 'var(--theme-input-bg)',
              color: 'var(--theme-text)',
              resize: 'vertical',
            }}
          />
          {error && <div style={{ color: 'var(--theme-error-500)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" buttonStyle="secondary" onClick={handleClose} disabled={loading}>
              取消
            </Button>
            <Button type="button" buttonStyle="secondary" onClick={handleAppend} disabled={loading}>
              追加到末尾
            </Button>
            <Button type="button" buttonStyle="primary" onClick={handleReplace} disabled={loading}>
              {loading ? '转换中…' : '替换内容'}
            </Button>
          </div>
        </div>
      </Modal>
    </React.Fragment>
  )
}

export default MarkdownImportButton
