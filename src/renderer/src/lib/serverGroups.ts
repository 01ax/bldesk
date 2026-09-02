import type { components } from '@shared/api/schema'
import { matchServers } from './commands'

type Server = components['schemas']['Server']

/**
 * Named server groups — "web", "db", "prod" — kept locally per account
 * because the BinaryLane API has no server tags.
 *
 * A group is a saved target expression in the palette's grammar (`wp-*`,
 * `db-*,cache-1`, `#101,#102`) plus optional pinned ids, so it stays true as
 * servers come and go: a glob group picks up a new `wp-web-5-syd` the moment
 * it exists. Anywhere that takes a target accepts `@name` for a group.
 */

export interface ServerGroup {
  id: string
  name: string
  /** Palette target expression; empty means "only the pinned ids". */
  pattern: string
  /** Explicit members, in addition to whatever `pattern` matches. */
  serverIds: number[]
  createdAt: string
}

const KEY = (profileId: string) => `bldesk_server_groups_${profileId}`
const TAGS_KEY = (profileId: string) => `bldesk_server_tags_${profileId}`

/** serverId → tags. A tag is also a group: every server tagged `web` is in `@web`. */
export type TagMap = Record<number, string[]>

export function normaliseTag(tag: string): string {
  return tag.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '')
}

export function loadTags(profileId: string | undefined): TagMap {
  if (!profileId) return {}
  try {
    const raw = localStorage.getItem(TAGS_KEY(profileId))
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

export function saveTags(profileId: string, tags: TagMap): void {
  try {
    localStorage.setItem(TAGS_KEY(profileId), JSON.stringify(tags))
  } catch {
    // storage unavailable
  }
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

export function tagsOf(tags: TagMap, serverId: number): string[] {
  return tags[serverId] ?? []
}

/** Returns the new map; never mutates. */
export function withTag(tags: TagMap, serverIds: number[], tag: string, present: boolean): TagMap {
  const t = normaliseTag(tag)
  if (!t) return tags
  const next: TagMap = { ...tags }
  for (const id of serverIds) {
    const cur = new Set(next[id] ?? [])
    if (present) cur.add(t)
    else cur.delete(t)
    if (cur.size) next[id] = [...cur].sort()
    else delete next[id]
  }
  return next
}

/** Every tag in use, with how many servers carry it. */
export function allTags(tags: TagMap): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const list of Object.values(tags)) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
}

/** Fired on window whenever groups change. */
export const GROUPS_EVENT = 'bldesk:server-groups'

export function loadGroups(profileId: string | undefined): ServerGroup[] {
  if (!profileId) return []
  try {
    const raw = localStorage.getItem(KEY(profileId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((g) => g && typeof g.name === 'string') : []
  } catch {
    return []
  }
}

export function saveGroups(profileId: string, groups: ServerGroup[]): void {
  try {
    localStorage.setItem(KEY(profileId), JSON.stringify(groups))
  } catch {
    // storage unavailable
  }
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

export function newGroup(name: string, pattern: string, serverIds: number[] = []): ServerGroup {
  return {
    id: `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    pattern: pattern.trim(),
    serverIds: [...new Set(serverIds)],
    createdAt: new Date().toISOString()
  }
}

/** Group name as typed in a target: `@web`. */
export function isGroupRef(token: string): boolean {
  return token.trim().startsWith('@') && token.trim().length > 1
}

/**
 * Groups plus one synthesised group per tag that has no explicit group of the
 * same name, so `@db` works the moment something is tagged `db`.
 */
export function effectiveGroups(groups: ServerGroup[], tags: TagMap): ServerGroup[] {
  const have = new Set(groups.map((g) => g.name.toLowerCase()))
  const synthesised = allTags(tags)
    .filter(({ tag }) => !have.has(tag))
    .map(({ tag }) => ({ id: `tag_${tag}`, name: tag, pattern: '', serverIds: [], createdAt: '' }))
  return [...groups, ...synthesised]
}

export function findGroup(groups: ServerGroup[], ref: string): ServerGroup | undefined {
  const name = ref.trim().replace(/^@/, '').toLowerCase()
  return groups.find((g) => g.name.toLowerCase() === name)
}

/** Every server in a group — pinned ids, pattern matches, and servers tagged with the group's name. */
export function resolveGroup(group: ServerGroup, servers: Server[], tags: TagMap = {}): Server[] {
  const ids = new Set<number>(group.serverIds)
  if (group.pattern.trim()) {
    for (const m of matchServers(servers, group.pattern).matches) ids.add(m.server.id)
  }
  const name = group.name.toLowerCase()
  for (const [id, list] of Object.entries(tags)) if (list.includes(name)) ids.add(Number(id))
  return servers.filter((s) => ids.has(s.id))
}

/**
 * Expand `@group` references inside a target expression into the concrete
 * server ids they currently match, leaving other patterns untouched. Unknown
 * groups are returned so the caller can say so.
 */
export function expandGroupRefs(
  expression: string,
  groups: ServerGroup[],
  servers: Server[],
  tags: TagMap = {}
): { expression: string; unknownGroups: string[] } {
  const unknownGroups: string[] = []
  const all = effectiveGroups(groups, tags)
  const parts = expression
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => {
      if (!isGroupRef(p)) return [p]
      const g = findGroup(all, p)
      if (!g) {
        unknownGroups.push(p)
        return []
      }
      const members = resolveGroup(g, servers, tags)
      // An empty group must not silently become "no targets" — surface it.
      return members.length ? members.map((s) => `#${s.id}`) : []
    })
  return { expression: parts.join(','), unknownGroups }
}
