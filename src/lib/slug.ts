const slugify = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

export const normalizeSlug = (data: { slug?: string; title?: string }) => {
  if (data.slug) {
    data.slug = slugify(data.slug)
  } else if (data.title) {
    data.slug = slugify(data.title)
  }
  return data
}
