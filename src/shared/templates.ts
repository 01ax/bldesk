export const MAX_TEMPLATE_BYTES = 256 * 1024
export const TEMPLATE_KIND = 'bldesk/server-template@1'

export function templateSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  if (!slug) throw new Error('Template name must contain a letter or number.')
  return slug
}
