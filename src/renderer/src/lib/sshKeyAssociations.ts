import type { LocalSshKey } from '@shared/ipc-types'

export const SSH_KEYS_EVENT = 'bldesk:ssh-key-associations'
type Source = 'manual' | 'learned'
type Store = { associations: Record<number, string>; sources: Record<number, Source>; lastWorking?: string }
const storageKey = (profileId: string) => `bldesk_ssh_keys_${profileId}`
function read(profileId?: string): Store {
  const empty: Store = { associations: {}, sources: {} }
  if (!profileId) return empty
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(profileId)) || '{}')
    for (const [id, path] of Object.entries(value.associations || {})) {
      if (/^[1-9]\d*$/.test(id) && typeof path === 'string' && path.trim()) {
        empty.associations[Number(id)] = path
        empty.sources[Number(id)] = value.sources?.[id] === 'learned' ? 'learned' : 'manual'
      }
    }
    if (typeof value.lastWorking === 'string') empty.lastWorking = value.lastWorking
  } catch { /* Malformed or unavailable local storage behaves like an empty store. */ }
  return empty
}
export function loadKeyAssociations(profileId?: string): Record<number, string> { return read(profileId).associations }
export function keyAssociationSource(profileId: string | undefined, serverId: number): Source | undefined {
  return read(profileId).sources[serverId]
}
export function lastWorkingKey(profileId?: string): string | undefined { return read(profileId).lastWorking }
export function setKeyAssociation(profileId: string | undefined, serverId: number, path: string | null,
  source: Source = 'manual', localKeys?: LocalSshKey[]): void {
  if (!profileId || !Number.isSafeInteger(serverId) || serverId <= 0) return
  const value = read(profileId)
  if (localKeys) {
    const available = new Set(localKeys.map((k) => k.privateKeyPath).filter(Boolean))
    for (const [id, existing] of Object.entries(value.associations)) {
      if (!available.has(existing)) { delete value.associations[Number(id)]; delete value.sources[Number(id)] }
    }
    if (!available.has(value.lastWorking)) delete value.lastWorking
    if (path && !available.has(path)) path = null
  }
  if (path) {
    value.associations[serverId] = path
    value.sources[serverId] = source
    if (source === 'learned') value.lastWorking = path
  } else { delete value.associations[serverId]; delete value.sources[serverId] }
  try {
    localStorage.setItem(storageKey(profileId), JSON.stringify(value))
    window.dispatchEvent(new Event(SSH_KEYS_EVENT))
  } catch { /* Local persistence is optional. */ }
}
export function resolveKeyFor(profileId: string | undefined, serverId: number | undefined, localKeys: LocalSshKey[]): string | undefined {
  const value = read(profileId)
  const available = new Set(localKeys.map((k) => k.privateKeyPath).filter(Boolean))
  const associated = serverId === undefined ? undefined : value.associations[serverId]
  if (associated && available.has(associated)) return associated
  if (value.lastWorking && available.has(value.lastWorking)) return value.lastWorking
  return undefined
}
