import { parse, stringify } from 'yaml'
import { MAX_TEMPLATE_BYTES, templateSlug } from '@shared/templates'

const STORAGE_KEY = 'bldesk_cloudinit_templates'

export class TemplateStoreUnreadableError extends Error {
  constructor() {
    super('Stored templates are unreadable; nothing was changed.')
    this.name = 'TemplateStoreUnreadableError'
  }
}

export interface CloudInitTemplate {
  name: string
  description: string
  created_at: string
  source?: { server_id?: number; server_name?: string; image_slug?: string }
  user_data: string
}

function api() {
  return typeof window !== 'undefined' ? window.bldeskApi : undefined
}

function fallbackRead(): Record<string, string> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return {}
  try {
    const value = JSON.parse(stored)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some((document) => typeof document !== 'string')) {
      throw new Error('Unexpected template storage shape.')
    }
    return value
  } catch {
    throw new TemplateStoreUnreadableError()
  }
}

function normaliseAndAssertDocumentSize(input: string): string {
  const document = input.endsWith('\n') ? input : `${input}\n`
  const bytes = new TextEncoder().encode(document).byteLength
  if (bytes > MAX_TEMPLATE_BYTES) {
    throw new Error(`Template YAML is ${bytes} bytes; the maximum is ${MAX_TEMPLATE_BYTES} bytes (256 KiB).`)
  }
  return document
}

export function parseTemplate(document: string): CloudInitTemplate {
  const value = parse(normaliseAndAssertDocumentSize(document))
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' || typeof value.user_data !== 'string') {
    throw new Error('Template YAML requires string fields "name" and "user_data".')
  }
  return {
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    source: value.source && typeof value.source === 'object' ? value.source : undefined,
    user_data: value.user_data
  }
}

export function templateYaml(template: CloudInitTemplate): string {
  return normaliseAndAssertDocumentSize(stringify(template, { lineWidth: 0 }))
}

export interface ListedTemplate {
  slug: string
  document: string
  template: CloudInitTemplate | null
  error?: string
  errorCode?: 'too_large' | 'unreadable' | 'invalid'
}

export async function listTemplates(): Promise<ListedTemplate[]> {
  const bridge = api()
  const documents: ListedTemplate[] = []
  if (bridge?.templatesList && bridge.templatesGet) {
    for (const slug of await bridge.templatesList()) {
      try {
        const result = await bridge.templatesGet(slug)
        if (result.ok) documents.push({ slug, document: result.document, template: null })
        else if (result.code !== 'missing') documents.push({ slug, document: '', template: null, error: result.message, errorCode: result.code })
      } catch (err: any) {
        documents.push({ slug, document: '', template: null, error: err.message || 'Could not read template YAML.' })
      }
    }
  } else {
    for (const [slug, document] of Object.entries(fallbackRead())) documents.push({ slug, document, template: null })
  }
  return documents.map(({ slug, document, error, errorCode }) => {
    if (error) return { slug, document, template: null, error, errorCode }
    try { return { slug, document, template: parseTemplate(document) } }
    catch (err: any) { return { slug, document, template: null, error: err.message || 'Invalid template YAML.', errorCode: 'invalid' as const } }
  }).sort((a, b) => (a.template?.name || a.slug).localeCompare(b.template?.name || b.slug))
}

export async function saveTemplate(template: CloudInitTemplate, oldSlug?: string): Promise<string> {
  const document = templateYaml(template)
  const bridge = api()
  let slug: string
  if (bridge?.templatesSave) slug = await bridge.templatesSave(document, oldSlug)
  else {
    slug = templateSlug(template.name)
    const all = fallbackRead()
    const previousSlug = oldSlug ? templateSlug(oldSlug) : undefined
    if (all[slug] && previousSlug !== slug) throw new Error(`A template named "${template.name}" already exists.`)
    if (previousSlug && previousSlug !== slug) delete all[previousSlug]
    all[slug] = document
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
  return slug
}

export async function removeTemplate(slug: string): Promise<void> {
  const bridge = api()
  if (bridge?.templatesRemove) await bridge.templatesRemove(slug)
  else {
    const all = fallbackRead()
    delete all[slug]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
}

export async function revealTemplate(slug: string): Promise<boolean> {
  const bridge = api()
  if (!bridge?.templatesReveal) return false
  await bridge.templatesReveal(slug)
  return true
}

export function isTemplateStoreUnreadable(error: unknown): boolean {
  return error instanceof TemplateStoreUnreadableError
}

export function resetTemplateStorage(): void {
  localStorage.removeItem(STORAGE_KEY)
}
