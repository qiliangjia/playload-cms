'use client'

import React from 'react'

type MediaDoc = {
  url?: string | null
  thumbnailURL?: string | null
  alt?: string | null
}

type Props = { cellData?: MediaDoc | string | number | null }

export const CoverImageCell: React.FC<Props> = ({ cellData }) => {
  if (!cellData || typeof cellData !== 'object') {
    return <span style={{ color: 'var(--theme-elevation-500)' }}>—</span>
  }
  const raw = cellData.thumbnailURL ?? cellData.url
  if (!raw) return <span style={{ color: 'var(--theme-elevation-500)' }}>—</span>
  const src = /^https?:\/\//.test(raw) ? `${raw}?w=128&q=85` : raw
  return (
    <img
      src={src}
      alt={cellData.alt ?? ''}
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

export default CoverImageCell
