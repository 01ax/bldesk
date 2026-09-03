import { parse, stringify } from 'yaml'
import type { components } from '@shared/api/schema'
import { MAX_TEMPLATE_BYTES, templateSlug } from '@shared/templates'
import type { FwRule } from './firewallMatrix'

type ServerResponse = components['schemas']['Server']

/**
 * Server templates (FEATURES.md #8): a template is a whole server, not a
 * cloud-init snippet — region, plan and its options, image, VPC, SSH keys,
 * firewall rules, local tags, and cloud-init with variables.
 *
 * Stored as YAML documents in the device-wide template store (main/templates.ts,
 * one file per slug), tagged `kind: bldesk/server-template@1`. Older documents
 * from the first cut (`name` + `user_data`) are read as cloud-init-only
 * templates, so nothing anyone saved is lost.
 *
 * Account-specific things are stored by *name*, never by id: SSH keys and VPCs
 * are resolved on the account the template is applied to, so a template
 * exported from one account applies on another.
 */

export const TEMPLATE_KIND = 'bldesk/server-template@1'

export interface TemplateVariable {
  name: string
  label?: string
  description?: string
  default?: string
  /** Rendered as a password field and never written into a saved template. */
  secret?: boolean
  required?: boolean
}

export interface ServerTemplateSpec {
  region?: string
  /** Plan slug, e.g. `std-2vcpu`. */
  size?: string
  /** Image slug, e.g. `ubuntu-24.04`. */
  image?: string
  options?: {
    memory?: number
    disk?: number
    ipv4_addresses?: number
    daily_backups?: number
    weekly_backups?: number
    monthly_backups?: number
    offsite_backups?: boolean
  }
  /** SSH key *names* on the account; resolved to ids when applied. */
  sshKeys?: string[]
  /** VPC *name*; resolved on the account when applied. */
  vpc?: string
  firewallRules?: FwRule[]
  /** Local BLDesk tags to apply to the new server. */
  tags?: string[]
  /** cloud-init user data, with `{{variable}}` placeholders. */
  cloudInit?: string
}

export interface ServerTemplate {
  kind: typeof TEMPLATE_KIND
  name: string
  description?: string
  /** Free-form labels for the library: "web", "hardened", "database". */
  labels?: string[]
  created_at: string
  updated_at?: string
  /** Where it was captured from, when it was. */
  source?: { server_id?: number; server_name?: string; captured_at?: string }
  variables?: TemplateVariable[]
  spec: ServerTemplateSpec
}

export interface ListedServerTemplate {
  slug: string
  template: ServerTemplate
  /** Shipped with the app; read-only until duplicated. */
  builtin?: boolean
  /** Original document, for export. */
  document?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/** Filled automatically when applying; never prompted for. */
export const BUILTIN_VARIABLES = ['hostname', 'region', 'image', 'size'] as const

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

/** Every `{{name}}` in the text, in order of first appearance, built-ins excluded. */
export function extractVariables(text: string | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(VAR_RE)) {
    const name = m[1]
    if ((BUILTIN_VARIABLES as readonly string[]).includes(name) || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * The variables a template needs answers for: declared ones (with their
 * labels and defaults) plus any `{{name}}` used in the cloud-init that was
 * never declared, so a hand-edited template still prompts for everything.
 */
export function templateVariables(t: ServerTemplate): TemplateVariable[] {
  const declared = new Map((t.variables ?? []).map((v) => [v.name, v]))
  for (const name of extractVariables(t.spec.cloudInit)) {
    if (!declared.has(name)) declared.set(name, { name, required: true })
  }
  return [...declared.values()]
}

/** Substitute `{{name}}` placeholders. Missing required values are an error, not a silent blank. */
export function renderCloudInit(text: string | undefined, values: Record<string, string>): string {
  if (!text) return ''
  const missing: string[] = []
  const out = text.replace(VAR_RE, (_, name: string) => {
    const v = values[name]
    if (v === undefined || v === '') {
      missing.push(name)
      return ''
    }
    return v
  })
  if (missing.length) throw new Error(`Missing value${missing.length === 1 ? '' : 's'} for ${[...new Set(missing)].map((m) => `{{${m}}}`).join(', ')}`)
  return out
}

// ---------------------------------------------------------------------------
// Serialisation + migration
// ---------------------------------------------------------------------------

function assertSize(document: string): string {
  const doc = document.endsWith('\n') ? document : `${document}\n`
  const bytes = new TextEncoder().encode(doc).byteLength
  if (bytes > MAX_TEMPLATE_BYTES) throw new Error(`Template is ${bytes} bytes; the maximum is ${MAX_TEMPLATE_BYTES} (256 KiB).`)
  return doc
}

export function templateToYaml(t: ServerTemplate): string {
  // Secrets are prompted for, never stored: strip any default on a secret variable.
  const safe: ServerTemplate = {
    ...t,
    kind: TEMPLATE_KIND,
    variables: t.variables?.map((v) => (v.secret ? { ...v, default: undefined } : v))
  }
  return assertSize(stringify(safe, { lineWidth: 0 }))
}

/** Parse a stored document — the current schema, or the first cut's `name` + `user_data`. */
export function templateFromYaml(document: string): ServerTemplate {
  const value = parse(assertSize(document))
  if (!value || typeof value !== 'object') throw new Error('Not a template document.')
  if (value.kind === TEMPLATE_KIND) {
    if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('Template needs a name.')
    const spec = value.spec && typeof value.spec === 'object' ? value.spec : {}
    return {
      kind: TEMPLATE_KIND,
      name: value.name,
      description: typeof value.description === 'string' ? value.description : undefined,
      labels: Array.isArray(value.labels) ? value.labels.filter((x: unknown) => typeof x === 'string') : undefined,
      created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
      updated_at: typeof value.updated_at === 'string' ? value.updated_at : undefined,
      source: value.source && typeof value.source === 'object' ? value.source : undefined,
      variables: Array.isArray(value.variables) ? value.variables.filter((v: any) => v && typeof v.name === 'string') : undefined,
      spec: {
        region: typeof spec.region === 'string' ? spec.region : undefined,
        size: typeof spec.size === 'string' ? spec.size : undefined,
        image: typeof spec.image === 'string' ? spec.image : undefined,
        options: spec.options && typeof spec.options === 'object' ? spec.options : undefined,
        sshKeys: Array.isArray(spec.sshKeys) ? spec.sshKeys.filter((x: unknown) => typeof x === 'string') : undefined,
        vpc: typeof spec.vpc === 'string' ? spec.vpc : undefined,
        firewallRules: Array.isArray(spec.firewallRules) ? spec.firewallRules : undefined,
        tags: Array.isArray(spec.tags) ? spec.tags.filter((x: unknown) => typeof x === 'string') : undefined,
        cloudInit: typeof spec.cloudInit === 'string' ? spec.cloudInit : undefined
      }
    }
  }
  // First-cut document: cloud-init only.
  if (typeof value.name === 'string' && typeof value.user_data === 'string') {
    return {
      kind: TEMPLATE_KIND,
      name: value.name,
      description: typeof value.description === 'string' ? value.description : undefined,
      created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
      source: value.source && typeof value.source === 'object' ? { server_id: value.source.server_id, server_name: value.source.server_name } : undefined,
      spec: { cloudInit: value.user_data, image: typeof value.source?.image_slug === 'string' ? value.source.image_slug : undefined }
    }
  }
  throw new Error('Not a BLDesk template: expected kind "bldesk/server-template@1" (or a name + user_data document).')
}

/** Export bundle: one or many templates in a single YAML file. */
export function bundleToYaml(templates: ServerTemplate[]): string {
  return stringify({ kind: 'bldesk/template-bundle@1', exported_at: new Date().toISOString(), templates: templates.map((t) => JSON.parse(JSON.stringify({ ...t, variables: t.variables?.map((v) => (v.secret ? { ...v, default: undefined } : v)) }))) }, { lineWidth: 0 })
}

/** Accepts a bundle, a single template document, or raw cloud-init (becomes a cloud-init-only template). */
export function templatesFromImport(text: string, fallbackName = 'Imported'): ServerTemplate[] {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Nothing to import.')
  let value: any
  try {
    value = parse(trimmed)
  } catch {
    value = null
  }
  if (value && typeof value === 'object' && value.kind === 'bldesk/template-bundle@1' && Array.isArray(value.templates)) {
    return value.templates.map((t: unknown) => templateFromYaml(stringify(t)))
  }
  if (value && typeof value === 'object' && (value.kind === TEMPLATE_KIND || (typeof value.name === 'string' && typeof value.user_data === 'string'))) {
    return [templateFromYaml(trimmed)]
  }
  if (trimmed.startsWith('#cloud-config') || trimmed.startsWith('#!')) {
    return [{ kind: TEMPLATE_KIND, name: fallbackName, created_at: new Date().toISOString(), spec: { cloudInit: trimmed } }]
  }
  throw new Error('Not a template, a template bundle, or cloud-init (expected "#cloud-config").')
}

// ---------------------------------------------------------------------------
// Capture from a live server
// ---------------------------------------------------------------------------

export function templateFromServer(
  server: ServerResponse,
  extras: { firewallRules?: FwRule[] | null; userData?: string | null; vpcName?: string; sshKeyNames?: string[]; tags?: string[] }
): ServerTemplate {
  const sel: any = server.selected_size_options ?? {}
  const publicIps = (server.networks?.v4 ?? []).filter((n) => n.type === 'public').length
  return {
    kind: TEMPLATE_KIND,
    name: `${server.name} template`,
    description: `Captured from ${server.name} (#${server.id}) — ${server.size_slug ?? 'plan'} in ${server.region?.name ?? server.region?.slug ?? 'region'}.`,
    created_at: new Date().toISOString(),
    source: { server_id: server.id, server_name: server.name, captured_at: new Date().toISOString() },
    spec: {
      region: server.region?.slug,
      size: server.size_slug ?? undefined,
      image: (server.image as any)?.slug ?? undefined,
      options: {
        memory: server.memory,
        disk: server.disk,
        ipv4_addresses: sel.ipv4_addresses ?? (publicIps || 1),
        daily_backups: sel.daily_backups ?? 0,
        weekly_backups: sel.weekly_backups ?? 0,
        monthly_backups: sel.monthly_backups ?? 0,
        offsite_backups: !!sel.offsite_backups
      },
      sshKeys: extras.sshKeyNames?.length ? extras.sshKeyNames : undefined,
      vpc: extras.vpcName,
      firewallRules: extras.firewallRules?.length ? extras.firewallRules.map((r) => ({
        action: r.action,
        protocol: r.protocol,
        destination_ports: r.destination_ports ?? null,
        source_addresses: r.source_addresses ?? [],
        destination_addresses: r.destination_addresses ?? [],
        description: r.description ?? null
      })) : undefined,
      tags: extras.tags?.length ? extras.tags : undefined,
      cloudInit: extras.userData?.trim() ? extras.userData : undefined
    }
  }
}

/** One-line summary of what a template sets, for lists and the confirm. */
export function describeTemplate(t: ServerTemplate): string {
  const s = t.spec
  const parts: string[] = []
  if (s.size) parts.push(s.size)
  if (s.image) parts.push(s.image)
  if (s.region) parts.push(s.region)
  if (s.vpc) parts.push(`VPC ${s.vpc}`)
  if (s.firewallRules?.length) parts.push(`${s.firewallRules.length} firewall rule${s.firewallRules.length === 1 ? '' : 's'}`)
  if (s.cloudInit) parts.push('cloud-init')
  const vars = templateVariables(t).length
  if (vars) parts.push(`${vars} variable${vars === 1 ? '' : 's'}`)
  return parts.join(' · ') || 'empty template'
}

// ---------------------------------------------------------------------------
// Store (device-wide, via the existing templates bridge; localStorage on Android)
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'bldesk_cloudinit_templates'
export const TEMPLATES_EVENT = 'bldesk:templates-changed'

function bridge() {
  return typeof window !== 'undefined' ? window.bldeskApi : undefined
}

function localAll(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function emit(): void {
  try {
    window.dispatchEvent(new CustomEvent(TEMPLATES_EVENT))
  } catch {
    // no window
  }
}

export async function listServerTemplates(): Promise<ListedServerTemplate[]> {
  const b = bridge()
  const docs: Array<{ slug: string; document: string; error?: string }> = []
  if (b?.templatesList && b.templatesGet) {
    for (const slug of await b.templatesList()) {
      try {
        const r = await b.templatesGet(slug)
        if (r.ok) docs.push({ slug, document: r.document })
        else if (r.code !== 'missing') docs.push({ slug, document: '', error: r.message })
      } catch (err: any) {
        docs.push({ slug, document: '', error: err?.message || 'unreadable' })
      }
    }
  } else {
    for (const [slug, document] of Object.entries(localAll())) docs.push({ slug, document })
  }
  return docs
    .map((d) => {
      if (d.error) return { slug: d.slug, template: { kind: TEMPLATE_KIND, name: d.slug, created_at: '', spec: {} } as ServerTemplate, error: d.error }
      try {
        return { slug: d.slug, template: templateFromYaml(d.document), document: d.document }
      } catch (err: any) {
        return { slug: d.slug, template: { kind: TEMPLATE_KIND, name: d.slug, created_at: '', spec: {} } as ServerTemplate, error: err?.message || 'invalid' }
      }
    })
    .sort((a, b) => a.template.name.localeCompare(b.template.name))
}

export async function saveServerTemplate(t: ServerTemplate, oldSlug?: string): Promise<string> {
  const document = templateToYaml({ ...t, updated_at: new Date().toISOString() })
  const b = bridge()
  let slug: string
  if (b?.templatesSave) {
    slug = await b.templatesSave(document, oldSlug)
  } else {
    slug = templateSlug(t.name)
    const all = localAll()
    const prev = oldSlug ? templateSlug(oldSlug) : undefined
    if (all[slug] && prev !== slug) throw new Error(`A template named "${t.name}" already exists.`)
    if (prev && prev !== slug) delete all[prev]
    all[slug] = document
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  }
  emit()
  return slug
}

export async function removeServerTemplate(slug: string): Promise<void> {
  const b = bridge()
  if (b?.templatesRemove) await b.templatesRemove(slug)
  else {
    const all = localAll()
    delete all[slug]
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  }
  emit()
}

// ---------------------------------------------------------------------------
// Applying a template
// ---------------------------------------------------------------------------

type Image = components['schemas']['Image']

export function imageSupportsUserData(image: Image | null | undefined): boolean {
  return !!image?.distribution_info?.features?.includes('user-data')
}

/** What the create form is seeded with. Names, not ids — the form resolves them on the account. */
export interface CreateServerPrefill {
  hostname?: string
  region?: string
  sizeSlug?: string
  imageSlug?: string
  memory?: number
  disk?: number
  ipCount?: number
  dailyBackups?: number
  weeklyBackups?: number
  monthlyBackups?: number
  offsiteBackups?: boolean
  vpcName?: string
  sshKeyNames?: string[]
  cloudInit?: string
}

/** Firewall rules can carry `{{variables}}` too (an admin CIDR, a port). */
export function renderRules(rules: FwRule[] | undefined, values: Record<string, string>): FwRule[] {
  if (!rules) return []
  const r = (s: string) => renderCloudInit(s, values)
  return rules.map((rule) => ({
    ...rule,
    source_addresses: rule.source_addresses.map(r),
    destination_addresses: rule.destination_addresses.map(r),
    destination_ports: rule.destination_ports ? rule.destination_ports.map(r) : rule.destination_ports,
    description: rule.description ? r(rule.description) : rule.description
  }))
}

/** Everything the create form needs, with variables filled in. */
export function prefillFromTemplate(t: ServerTemplate, hostname: string, values: Record<string, string>): CreateServerPrefill {
  const s = t.spec
  const all = { ...values, hostname, region: s.region ?? '', image: s.image ?? '', size: s.size ?? '' }
  return {
    hostname,
    region: s.region,
    sizeSlug: s.size,
    imageSlug: s.image,
    memory: s.options?.memory,
    disk: s.options?.disk,
    ipCount: s.options?.ipv4_addresses,
    dailyBackups: s.options?.daily_backups,
    weeklyBackups: s.options?.weekly_backups,
    monthlyBackups: s.options?.monthly_backups,
    offsiteBackups: s.options?.offsite_backups,
    vpcName: s.vpc,
    sshKeyNames: s.sshKeys,
    cloudInit: s.cloudInit ? renderCloudInit(s.cloudInit, all) : undefined
  }
}

/** The values a render needs: user answers plus the built-ins. */
export function withBuiltins(t: ServerTemplate, hostname: string, values: Record<string, string>): Record<string, string> {
  return { ...values, hostname, region: t.spec.region ?? '', image: t.spec.image ?? '', size: t.spec.size ?? '' }
}
