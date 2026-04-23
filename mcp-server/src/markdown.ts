import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { PayloadClient } from './payloadClient.js'

const IMAGE_RE = /(!\[[^\]]*]\()([^)\s]+)(\s+"[^"]*")?\)/g

export const ensureInsideHome = (absolutePath: string): void => {
  const home = os.homedir()
  const resolved = path.resolve(absolutePath)
  const rel = path.relative(home, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to read ${resolved}: path is outside the user's home directory`)
  }
}

export const resolveRelativeToMarkdown = (
  baseDir: string | undefined,
  imageRef: string,
): string => {
  if (/^https?:\/\//i.test(imageRef) || imageRef.startsWith('data:')) return imageRef
  const base = baseDir ? path.resolve(baseDir) : process.cwd()
  return path.resolve(base, imageRef)
}

// Upload every local image referenced from the markdown body, rewrite to the R2 URL.
export const rewriteInlineImages = async (
  markdown: string,
  baseDir: string | undefined,
  client: PayloadClient,
): Promise<string> => {
  const cache = new Map<string, string>()
  const promises: Array<Promise<void>> = []
  const refs: Array<{ prefix: string; original: string; title: string }> = []

  markdown.replace(IMAGE_RE, (_, prefix: string, ref: string, title: string | undefined) => {
    refs.push({ prefix, original: ref, title: title ?? '' })
    return ''
  })

  for (const ref of refs) {
    if (/^https?:\/\//i.test(ref.original) || ref.original.startsWith('data:')) continue
    if (cache.has(ref.original)) continue
    const absolute = resolveRelativeToMarkdown(baseDir, ref.original)
    ensureInsideHome(absolute)
    cache.set(ref.original, '')
    promises.push(
      fs.stat(absolute).then(async () => {
        const { url } = await client.uploadMedia(absolute)
        cache.set(ref.original, url)
      }),
    )
  }
  await Promise.all(promises)

  return markdown.replace(IMAGE_RE, (_, prefix: string, ref: string, title: string | undefined) => {
    const rewritten = cache.get(ref)
    const finalRef = rewritten && rewritten.length > 0 ? rewritten : ref
    return `${prefix}${finalRef}${title ?? ''})`
  })
}
