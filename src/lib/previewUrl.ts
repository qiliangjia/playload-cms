const PROD_HOST = 'https://deepclick.com'
const TEST_HOST = 'https://www-test-deepclick.qiliangjia.one'

export type PreviewKind = 'blog' | 'doc'

export const buildPreviewUrl = (
  kind: PreviewKind,
  status: unknown,
  slug: unknown,
  locale?: unknown,
): string | undefined => {
  if (typeof slug !== 'string' || !slug) return undefined
  const host = status === 'published' ? PROD_HOST : TEST_HOST
  // SSG builds mirror every route under /zh-CN for the Chinese locale, so the
  // preview link must match whichever locale the editor is currently viewing.
  const localePrefix = locale === 'zh-CN' ? '/zh-CN' : ''
  const path = kind === 'blog' ? `/resources/blog/${slug}` : `/docs/${slug}`
  return `${host}${localePrefix}${path}`
}
