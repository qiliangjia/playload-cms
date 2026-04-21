'use client'

import React from 'react'

type Props = { cellData?: string | null }

export const PreviewUrlCell: React.FC<Props> = ({ cellData }) => {
  if (!cellData) return <span style={{ color: 'var(--theme-elevation-500)' }}>—</span>
  return (
    <a
      href={cellData}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      style={{ color: 'var(--theme-text)', textDecoration: 'underline' }}
    >
      {cellData}
    </a>
  )
}

export default PreviewUrlCell
