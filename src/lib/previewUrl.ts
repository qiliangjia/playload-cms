const PROD_HOST = 'https://deepclick.com'
const TEST_HOST = 'https://www-test-deepclick.qiliangjia.one'

export type PreviewKind = 'blog' | 'doc'

export const buildPreviewUrl = (
  kind: PreviewKind,
  status: unknown,
  slug: unknown,
): string | undefined => {
  if (typeof slug !== 'string' || !slug) return undefined
  const host = status === 'published' ? PROD_HOST : TEST_HOST
  const path = kind === 'blog' ? `/resources/blog/${slug}` : `/docs/${slug}`
  return `${host}${path}`
}
