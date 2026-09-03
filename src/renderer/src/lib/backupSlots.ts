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
