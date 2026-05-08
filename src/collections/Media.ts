import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

const HASH_LENGTH = 12
const HASH_SUFFIX_RE = new RegExp(`-[0-9a-f]{${HASH_LENGTH}}$`)

const computeContentHash = async (data: Buffer | Uint8Array): Promise<string> => {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data)
  const digest = await crypto.subtle.digest('SHA-256', view)
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return hex.slice(0, HASH_LENGTH)
}

const splitName = (raw: string): { base: string; ext: string } => {
  const name = raw.trim() || 'image'
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

// Rewrite incoming filenames to <base>-<sha256_12hex>.<ext>. Two reasons:
// 1) Browser pastes always give basename `image.png`, so Payload's filename
//    dedup falls back to slot scanning (`image-1.png`, `image-2.png`, ...).
//    When a doc in the middle gets deleted, the next paste reuses its slot and
//    the R2 key — silently overwriting bytes that older docs/posts still link
//    to. Content-hashed names make every key content-addressed, so reuse is
//    only possible when the bytes are byte-identical (which is fine).
// 2) With content-addressed keys, the worker's `Cache-Control: immutable`
//    header is finally correct.
const renameWithContentHash: CollectionBeforeOperationHook = async ({ args, operation }) => {
  if (operation !== 'create') return args
  const file = args?.req?.file
  if (!file?.data || !file.name) return args

  const hash = await computeContentHash(file.data as Buffer | Uint8Array)
  const { base, ext } = splitName(file.name)
  const cleanBase = base.replace(HASH_SUFFIX_RE, '') || 'image'
  file.name = `${cleanBase}-${hash}${ext}`
  return args
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  hooks: {
    beforeOperation: [renameWithContentHash],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
}
