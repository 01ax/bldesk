import type { components } from '../../../shared/api/schema'
import { ApiError } from '../api/errors.ts'
import { availableBackupSlots, freeBackupSlots, replaceableBackups, type BackupSlot, type ExistingBackup } from './backupSlots.ts'

export type UploadImageBody = components['schemas']['UploadImageRequest']
export type ImportStrategy = UploadImageBody['replacement_strategy']
type Retention = Parameters<typeof availableBackupSlots>[0]

export interface ImportDraft {
  url: string
  label: string
  slot: BackupSlot
  strategy: ImportStrategy
  replacementId: number | null
}

export const IMPORT_STRATEGIES: Record<ImportStrategy, string> = {
  none: 'Use a free slot only',
  oldest: 'Replace oldest if full',
  newest: 'Replace newest if full',
  specified: 'Replace a specific image'
}

export const IMPORT_TEMPORARY_TERMS =
  'Temporary images are kept for up to 48 hours, or up to seven days for an uploaded .iso image.'

export const IMPORT_UNKNOWN_OUTCOME =
  'No usable response was received from BinaryLane. The import may or may not have started. Check Backups and server actions before trying again.'

export const IMPORT_NO_ACTION =
  'BinaryLane accepted the import request but returned no action to follow. Check Backups and server actions before trying again.'

export function importSource(value: string): URL {
  if (!/^https?:\/\//i.test(value.trim())) throw new Error('Enter a valid HTTP or HTTPS image URL.')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a valid HTTP or HTTPS image URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter a valid HTTP or HTTPS image URL.')
  return url
}

/** Omit access details from the source row; server-supplied error/progress text is separate. */
export function importSourceSummary(value: string): string {
  const url = importSource(value)
  const shown = `${url.origin}${url.pathname}`
  return `${shown}${url.href !== shown ? ' (access details omitted)' : ''}`
}

/** Bound a pre-confirmation read without allowing its eventual result to resume a timed-out submission. */
export async function readImportState<T>(read: () => Promise<T>, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Could not read the server within ${timeoutMs / 1000} seconds. Try again before importing.`)), timeoutMs)
      })
    ])
  } finally { clearTimeout(timer) }
}

type ImportSubmission<T> =
  | { kind: 'queued'; action: T }
  | { kind: 'unknown'; detail: string }
  | { kind: 'failed'; error: unknown }

/** Called after confirmation. Transport and server errors may follow execution; never retry here. */
export async function submitImageImport<T extends { id?: number }>(upload: () => Promise<T | null | undefined>): Promise<ImportSubmission<T>> {
  try {
    const action = await upload()
    return action?.id ? { kind: 'queued', action } : { kind: 'unknown', detail: IMPORT_NO_ACTION }
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) return { kind: 'unknown', detail: IMPORT_UNKNOWN_OUTCOME }
    if (error instanceof ApiError && error.status !== undefined && error.status >= 500 && error.status < 600) {
      return { kind: 'unknown', detail: `BinaryLane returned HTTP ${error.status}. The import may or may not have started. Check Backups and server actions before trying again.` }
    }
    return { kind: 'failed', error }
  }
}

/** Resolve the submitted choice against a fresh server and backup list, never silently choose a different slot. */
export function planImageImport(draft: ImportDraft, options: Retention, existing: ExistingBackup[], attachedId?: number | null): {
  body: UploadImageBody
  replaced?: ExistingBackup
} {
  const source = importSource(draft.url)
  const label = draft.label.trim()
  if (label.length > 250) throw new Error('The image label must be 250 characters or fewer.')
  const body: UploadImageBody = { url: source.href, replacement_strategy: draft.strategy, ...(label ? { label } : {}) }
  const replaceable = replaceableBackups(existing, attachedId)
  if (draft.strategy === 'specified') {
    const replaced = replaceable.find((b) => b.id === draft.replacementId)
    if (!replaced) throw new Error('The selected image is no longer replaceable. It may have been removed, locked or attached. Choose another image.')
    body.backup_id_to_replace = replaced.id
    body.backup_type = replaced.backup_info.type
    return { body, replaced }
  }
  if (!availableBackupSlots(options).includes(draft.slot)) throw new Error('This server no longer has the selected backup slot type. Choose another slot.')
  body.backup_type = draft.slot
  if (freeBackupSlots(options, existing).includes(draft.slot)) return { body }
  if (draft.strategy === 'none') throw new Error('No free slot of this type is available. Choose a replacement strategy or another slot.')
  const candidates = replaceable.filter((b) => b.backup_info.type === draft.slot)
  if (candidates.length === 0) throw new Error('No image of this type can be replaced. The held images may be locked or attached.')
  const age = (b: ExistingBackup) => Date.parse(b.created_at ?? '')
  // An automatic replacement need not have a predictable candidate if the API did not return creation dates.
  if (candidates.some((b) => !Number.isFinite(age(b)))) return { body }
  candidates.sort((a, b) => age(a) - age(b) || a.id - b.id)
  return { body, replaced: draft.strategy === 'newest' ? candidates.at(-1) : candidates[0] }
}
