/**
 * Small, dependency-free diff helpers for the confirm dialog and the change
 * log. Line diffs are LCS-based so a rule inserted in the middle of a
 * firewall list shows as one `+` line, not a wall of remove/add pairs.
 */

export type DiffLineKind = 'add' | 'remove' | 'same'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

/** A before → after change to one named field, for the change table. */
export interface FieldChange {
  label: string
  from?: string
  to?: string
}

/** Longest-common-subsequence line diff. Order-sensitive on purpose. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  // lcs[i][j] = LCS length of before[i:] and after[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: 'same', text: before[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'remove', text: before[i] })
      i++
    } else {
      out.push({ kind: 'add', text: after[j] })
      j++
    }
  }
  while (i < n) out.push({ kind: 'remove', text: before[i++] })
  while (j < m) out.push({ kind: 'add', text: after[j++] })
  return out
}

/** True when the diff contains any change at all. */
export function hasChanges(diff: DiffLine[]): boolean {
  return diff.some((l) => l.kind !== 'same')
}

/** Count of added / removed lines, for a one-line summary. */
export function summariseDiff(diff: DiffLine[]): string {
  let add = 0
  let remove = 0
  for (const l of diff) {
    if (l.kind === 'add') add++
    else if (l.kind === 'remove') remove++
  }
  const parts: string[] = []
  if (add) parts.push(`+${add}`)
  if (remove) parts.push(`−${remove}`)
  return parts.length ? parts.join(' / ') : 'no change'
}

/** Build a change table from two flat objects, listing only fields that differ. */
export function changesBetween(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels?: Record<string, string>
): FieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: FieldChange[] = []
  for (const k of keys) {
    const a = before[k]
    const b = after[k]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    out.push({ label: labels?.[k] ?? k, from: fmt(a), to: fmt(b) })
  }
  return out
}

function fmt(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : undefined
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ---------------------------------------------------------------------------
// Domain-specific one-liners
// ---------------------------------------------------------------------------

interface FirewallRuleLike {
  action?: string | null
  protocol?: string | null
  destination_ports?: string[] | null
  source_addresses?: string[] | null
  destination_addresses?: string[] | null
  description?: string | null
}

/** `accept tcp 22,443 from 0.0.0.0/0 — web` — stable, so identical rules diff as `same`. */
export function describeFirewallRule(rule: FirewallRuleLike): string {
  const ports = rule.destination_ports?.length ? ` ${rule.destination_ports.join(',')}` : ''
  const from = rule.source_addresses?.length ? ` from ${rule.source_addresses.join(',')}` : ''
  const to = rule.destination_addresses?.length ? ` to ${rule.destination_addresses.join(',')}` : ''
  const desc = rule.description?.trim() ? ` — ${rule.description.trim()}` : ''
  return `${rule.action ?? '?'} ${rule.protocol ?? 'all'}${ports}${from}${to}${desc}`
}

interface DnsRecordLike {
  type?: string | null
  name?: string | null
  data?: string | null
  priority?: number | null
  ttl?: number | null
}

export function describeDnsRecord(r: DnsRecordLike): string {
  const pri = r.priority != null ? ` ${r.priority}` : ''
  return `${r.name ?? '@'} ${r.type ?? '?'}${pri} ${r.data ?? ''}`.trim()
}
