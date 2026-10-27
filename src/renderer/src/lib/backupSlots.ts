export type BackupSlot = 'temporary' | 'daily' | 'weekly' | 'monthly'

type BackupRetention =
  | { daily_backups?: number | null; weekly_backups?: number | null; monthly_backups?: number | null }
  | null
  | undefined

/** Pre-action backup types need retention both before and after the resize. */
export function retainedBackupTypes(current: BackupRetention, pending: BackupRetention): BackupSlot[] {
  const retained = availableBackupSlots(pending)
  return availableBackupSlots(current).filter((slot) => retained.includes(slot))
}

/** Scheduled types whose configured retention is being reduced. */
export function reducedBackupSlots(current: BackupRetention, pending: BackupRetention): BackupSlot[] {
  return (['daily', 'weekly', 'monthly'] as const).filter(
    (slot) => (pending?.[`${slot}_backups`] ?? 0) < (current?.[`${slot}_backups`] ?? 0)
  )
}

/**
 * The backup types permitted by a server's current retention, not free capacity.
 *
 * The API rejects a slot the server has no retention for ("Validation of
 * pre_action_backup.backup_type, pre_action_backup.replacement_strategy
 * failed"), and it is the server's *current* retention that counts: a
 * pre-action backup is taken before any new options apply. Temporary needs no
 * scheduled retention, but its one slot may already be occupied.
 *
 * Shared by the Backup Manager's slot picker and Change Plan's pre-action
 * backup so the two cannot disagree about what the server can hold.
 */
export function availableBackupSlots(
  options: { daily_backups?: number | null; weekly_backups?: number | null; monthly_backups?: number | null } | null | undefined
): BackupSlot[] {
  const out: BackupSlot[] = ['temporary']
  if ((options?.daily_backups ?? 0) > 0) out.push('daily')
  if ((options?.weekly_backups ?? 0) > 0) out.push('weekly')
  if ((options?.monthly_backups ?? 0) > 0) out.push('monthly')
  return out
}

/**
 * What the API reference says about temporary backups, from BackupSlot ("only retained for a maximum of 48 hours (seven
 * days for an uploaded .iso image)") and from the Take Backup action ("At most two temporary
 * backups may be taken of a server in any seven day period"). Shown wherever Temporary is chosen.
 */
export const TEMPORARY_BACKUP_TERMS =
  'A temporary backup is kept for up to 48 hours, and at most two can be taken of a server in any seven day period.'

/**
 * Shown on a server that keeps no daily, weekly or monthly backups. Not in the API reference: BinaryLane confirmed on 21
 * October 2026 that it keeps backups of a server only on a backup schedule. A backup taken by hand is the one exception,
 * and its 48 hours is the reference's (see TEMPORARY_BACKUP_TERMS).
 */
export const NO_SCHEDULED_BACKUPS_WARNING =
  "This server has no scheduled backups. BinaryLane keeps backups of a server only on a backup schedule: apart from one you take by hand, which is kept for up to 48 hours, it holds no copy of this server's data. Anything lost from the server, such as deleted, overwritten or corrupted data, is lost for good."

export const NO_SCHEDULED_BACKUPS_EMPTY =
  'A backup taken now is a temporary one, kept for up to 48 hours. Enable Daily Backups above, or use the Backups section of Change Plan, to keep scheduled backups.'

export const BACKUP_SLOT_LABELS: Record<BackupSlot, string> = {
  temporary: 'Temporary (kept up to 48 hours)',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly'
}

export interface ExistingBackup {
  id: number
  created_at?: string | null
  name?: string | null
  backup_info?: { type?: string | null; locked?: boolean | null; iso?: boolean | null } | null
}

export const ISO_IMAGE_RESTRICTION = 'ISO images can be attached, but cannot be downloaded or restored.'

/** BackupInfo.iso in the public reference rules out Download and Restore. */
export function isIsoBackup(image: Pick<ExistingBackup, 'backup_info'> | null | undefined): boolean {
  return image?.backup_info?.iso === true
}

type SlottedBackup = ExistingBackup & { backup_info: { type: BackupSlot } }

/** Named replacement cannot use a locked, attached or unknown-type image. */
export function replaceableBackups(existing: ExistingBackup[], attachedId?: number | null): SlottedBackup[] {
  return existing.filter((backup): backup is SlottedBackup =>
    !!backup.backup_info?.type && Object.hasOwn(BACKUP_SLOT_LABELS, backup.backup_info.type) &&
    !backup.backup_info.locked && backup.id !== attachedId
  )
}

/**
 * The slots that are not just permitted but actually *empty*.
 *
 * Retention says how many backups of a type a server may keep;
 * `replacement_strategy: 'none'` then requires one of those to be unused, and
 * errors if not. So a server with `daily_backups: 1` that already holds a daily
 * backup has a permitted daily slot and no free one - offering it produces a
 * predictable failure. Where nothing is free, the caller should offer
 * `specified` against a named backup instead, which makes the deletion explicit
 * rather than implied by "oldest".
 *
 * The single temporary slot is free only when no temporary backup is held.
 */
export function freeBackupSlots(
  options:
    | { daily_backups?: number | null; weekly_backups?: number | null; monthly_backups?: number | null }
    | null
    | undefined,
  existing: ExistingBackup[]
): BackupSlot[] {
  const held = (t: string): number => existing.filter((b) => b.backup_info?.type === t).length
  const out: BackupSlot[] = held('temporary') === 0 ? ['temporary'] : []
  if ((options?.daily_backups ?? 0) - held('daily') > 0) out.push('daily')
  if ((options?.weekly_backups ?? 0) - held('weekly') > 0) out.push('weekly')
  if ((options?.monthly_backups ?? 0) - held('monthly') > 0) out.push('monthly')
  return out
}

/**
 * The backup `replacement_strategy: 'oldest'` replaces when a backup is taken
 * into `slot`, or null when nothing is replaced. The reference: "Use any free
 * slots of the provided backup type, and if there are no free slots replace the
 * oldest unlocked and un-attached backup of the provided backup type."
 *
 * `certain` says the replacement will happen rather than may. Daily, weekly and
 * monthly retention is a count in `selected_size_options`, so a full slot is
 * known. The reference gives no count for temporary backups, so holding one only
 * means it is replaced if there is no free temporary slot.
 */
export function replacedByOldest(
  slot: BackupSlot,
  options: { daily_backups?: number | null; weekly_backups?: number | null; monthly_backups?: number | null } | null | undefined,
  existing: ExistingBackup[],
  attachedId?: number | null
): { backup: ExistingBackup; certain: boolean } | null {
  if (slot !== 'temporary' && freeBackupSlots(options, existing).includes(slot)) return null
  const age = (b: ExistingBackup) => Date.parse(b.created_at ?? '') || Infinity
  const oldest = existing
    .filter((b) => b.backup_info?.type === slot && !b.backup_info.locked && b.id !== attachedId)
    .sort((a, b) => (age(a) === age(b) ? a.id - b.id : age(a) - age(b)))[0]
  return oldest ? { backup: oldest, certain: slot !== 'temporary' } : null
}

/** "Daily - 2026-09-03 10:46" for a replace-this-one picker. */
export function describeBackup(b: ExistingBackup): string {
  const type = b.backup_info?.type
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Backup'
  const when = b.created_at ? new Date(b.created_at).toLocaleString() : (b.name ?? String(b.id))
  return `${label} - ${when}`
}
