export type BackupSlot = 'temporary' | 'daily' | 'weekly' | 'monthly'

/**
 * The backup slots a server can take a backup into right now.
 *
 * The API rejects a slot the server has no retention for ("Validation of
 * pre_action_backup.backup_type, pre_action_backup.replacement_strategy
 * failed"), and it is the server's *current* retention that counts: a
 * pre-action backup is taken before any new options apply. Temporary is
 * on-demand and always available.
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

export const BACKUP_SLOT_LABELS: Record<BackupSlot, string> = {
  temporary: 'Temporary (kept up to 7 days)',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly'
}

export interface ExistingBackup {
  id: number
  created_at?: string | null
  name?: string | null
  backup_info?: { type?: string | null } | null
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
 * Temporary is on-demand and has no retention setting, so it is always free.
 */
export function freeBackupSlots(
  options:
    | { daily_backups?: number | null; weekly_backups?: number | null; monthly_backups?: number | null }
    | null
    | undefined,
  existing: ExistingBackup[]
): BackupSlot[] {
  const held = (t: string): number => existing.filter((b) => b.backup_info?.type === t).length
  const out: BackupSlot[] = ['temporary']
  if ((options?.daily_backups ?? 0) - held('daily') > 0) out.push('daily')
  if ((options?.weekly_backups ?? 0) - held('weekly') > 0) out.push('weekly')
  if ((options?.monthly_backups ?? 0) - held('monthly') > 0) out.push('monthly')
  return out
}

/** "Daily - 2026-09-03 10:46" for a replace-this-one picker. */
export function describeBackup(b: ExistingBackup): string {
  const type = b.backup_info?.type
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Backup'
  const when = b.created_at ? new Date(b.created_at).toLocaleString() : (b.name ?? String(b.id))
  return `${label} - ${when}`
}
