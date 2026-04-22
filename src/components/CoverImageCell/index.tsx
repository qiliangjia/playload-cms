'use client'

import React from 'react'

type MediaDoc = {
  id?: string | number
  url?: string | null
  thumbnailURL?: string | null
  alt?: string | null
}

type Props = { cellData?: MediaDoc | string | number | null }

const placeholder = <span style={{ color: 'var(--theme-elevation-500)' }}>—</span>

function withSizeHint(raw: string): string {
  if (!/^https?:\/\//.test(raw)) return raw
  return raw.includes('?') ? raw : `${raw}?w=128&q=85`
}

function renderImg(src: string, alt: string) {
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: 64,
        height: 40,
        objectFit: 'cover',
        borderRadius: 4,
        display: 'block',
        background: 'var(--theme-elevation-100)',
      }}
    />
  )
}

export const CoverImageCell: React.FC<Props> = ({ cellData }) => {
  const [fetched, setFetched] = React.useState<MediaDoc | null>(null)

  const id =
    typeof cellData === 'string' || typeof cellData === 'number'
      ? cellData
      : cellData && typeof cellData === 'object' && cellData.id != null
        ? cellData.id
        : null

  const populated: MediaDoc | null =
    fetched ?? (cellData && typeof cellData === 'object' ? (cellData as MediaDoc) : null)

  React.useEffect(() => {
    if (fetched || !id) return
    if (populated?.url || populated?.thumbnailURL) return
    let cancelled = false
    fetch(`/api/media/${id}?depth=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: MediaDoc | null) => {
        if (!cancelled && doc) setFetched(doc)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, fetched, populated?.url, populated?.thumbnailURL])

  const raw = populated?.thumbnailURL ?? populated?.url
  if (!raw) return placeholder
  return renderImg(withSizeHint(raw), populated?.alt ?? '')
}

export default CoverImageCell
