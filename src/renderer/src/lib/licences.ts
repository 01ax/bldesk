/**
 * Licensed software for Change Plan - the `change_licenses` half of a resize.
 *
 * Two shapes of choice come back from `/v2/software/operating_system/{slug}`,
 * and they are told apart by `group`:
 *
 *   grouped   cPanel's account tiers. Mutually exclusive - one licence, and the
 *             tier is which one. A dropdown.
 *   ungrouped CloudLinux, KernelCare. Independent add-ons. A checkbox each.
 *
 * Costs come from the same response, so no price is derived here. They are
 * ex-GST monthly, matching `size.price_monthly`.
 *
 * Neither `/v2/software` nor the per-OS list returns everything, though: both
 * are filtered to `enabled` software, and BinaryLane keeps billing products it
 * has closed to new orders. Remote Desktop SAL is the case that matters -
 * `enabled: false`, absent from both lists, $9.09 per licence up to 50 of them,
 * and a live Windows server can be holding two. The API is explicit that
 * "disabled software may be retained by servers that already have it", so what
 * the panel can offer is the enabled list *plus* whatever the server holds.
 * See `offerableSoftware`.
 */

export interface SoftwareLike {
  id: number
  name: string
  description?: string | null
  group?: string | null
  enabled?: boolean
  cost_per_licence_per_month: number
  minimum_licence_count: number
  maximum_licence_count: number
  licence_step_count: number
}

/** software_id -> licence count. Absent means not licensed. */
export type LicenceSelection = Record<number, number>

export interface LicenceGroup {
  name: string
  options: SoftwareLike[]
  /**
   * The option that means "no licence", where the OS offers one. alma-9 and
   * ubuntu-24.04 include an explicit "cPanel: Not required"; the cPanel images
   * do not, because a cPanel server must carry a cPanel licence, and their
   * cheapest tier is $0 instead.
   */
  optOut: SoftwareLike | null
}

const byCost = (a: SoftwareLike, b: SoftwareLike): number =>
  a.cost_per_licence_per_month - b.cost_per_licence_per_month || a.name.localeCompare(b.name)

/** Split the offered licences into exclusive groups and independent add-ons. */
export function splitSoftware(offered: SoftwareLike[]): { groups: LicenceGroup[]; addons: SoftwareLike[] } {
  const groups = new Map<string, SoftwareLike[]>()
  const addons: SoftwareLike[] = []
  for (const s of offered) {
    if (s.group) {
      const list = groups.get(s.group) ?? []
      list.push(s)
      groups.set(s.group, list)
    } else {
      addons.push(s)
    }
  }
  return {
    groups: [...groups.entries()]
      .map(([name, options]) => {
        const sorted = [...options].sort(byCost)
        return {
          name,
          options: sorted,
          optOut: sorted.find((o) => /not required|none|no licence|no license/i.test(o.name)) ?? null
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    addons: addons.sort(byCost)
  }
}

/** Monthly cost, ex-GST, of a selection. */
export function licenceCost(offered: SoftwareLike[], selection: LicenceSelection): number {
  let total = 0
  for (const [id, count] of Object.entries(selection)) {
    const s = offered.find((o) => o.id === Number(id))
    if (s && count > 0) total += s.cost_per_licence_per_month * count
  }
  return total
}

/**
 * What the server holds today, as a selection.
 *
 * `incompatible` entries are dropped: the API removes those at the next plan
 * change whatever we send, so carrying one into the form would show a licence
 * as kept and then have it disappear.
 */
export function currentSelection(
  licensed: Array<{ software: SoftwareLike; licence_count: number; incompatible: boolean }>
): LicenceSelection {
  const out: LicenceSelection = {}
  for (const l of licensed) {
    if (!l.incompatible && l.licence_count > 0) out[l.software.id] = l.licence_count
  }
  return out
}

/** Monthly cost, ex-GST, of what the server holds today. */
export function currentLicenceCost(
  licensed: Array<{ software: SoftwareLike; licence_count: number; incompatible: boolean }>
): number {
  return licensed.reduce(
    (sum, l) => (l.incompatible ? sum : sum + l.software.cost_per_licence_per_month * l.licence_count),
    0
  )
}

export function selectionsEqual(a: LicenceSelection, b: LicenceSelection): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if ((a[Number(k)] ?? 0) !== (b[Number(k)] ?? 0)) return false
  }
  return true
}

/** The `change_licenses.licenses` array. */
export function toLicencePayload(selection: LicenceSelection): Array<{ software_id: number; count: number }> {
  return Object.entries(selection)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ software_id: Number(id), count }))
}

/** "cPanel: Up to 30 Accounts" -> "Up to 30 Accounts", so the group label is not repeated. */
export function shortName(s: SoftwareLike): string {
  return s.group && s.name.startsWith(s.group) ? s.name.slice(s.group.length).replace(/^[:\s-]+/, '') : s.name
}

/** "+$25.00/mo", or "included" at no cost. */
export function costLabel(s: SoftwareLike, count = 1): string {
  const c = s.cost_per_licence_per_month * count
  return c > 0 ? `+$${c.toFixed(2)}/mo` : 'included'
}

/** Counts a licence can be bought in, honouring min/max/step. */
export function countChoices(s: SoftwareLike): number[] {
  const step = s.licence_step_count > 0 ? s.licence_step_count : 1
  const out: number[] = []
  for (let n = s.minimum_licence_count; n <= s.maximum_licence_count; n += step) out.push(n)
  return out.length ? out : [1]
}

/**
 * The licences the panel can act on: what this OS sells today, plus whatever the
 * server already holds.
 *
 * Without the second half a resize would quietly drop any licence that is no
 * longer sold - `change_licenses` removes anything not listed - so a Windows
 * server holding Remote Desktop SAL would lose it the first time someone
 * changed its memory. Incompatible entries are left out: the API removes those
 * at the next plan change regardless.
 */
export function offerableSoftware(
  osSoftware: SoftwareLike[],
  licensed: Array<{ software: SoftwareLike; licence_count: number; incompatible: boolean }>
): SoftwareLike[] {
  const out = [...osSoftware]
  for (const l of licensed) {
    if (!l.incompatible && !out.some((o) => o.id === l.software.id)) out.push(l.software)
  }
  return out
}

/**
 * Held but no longer on offer, so it can be kept or given up - not re-added.
 * Worth saying out loud next to a checkbox that cannot be un-ticked twice.
 */
export function isRetainedOnly(id: number, osSoftware: SoftwareLike[]): boolean {
  return !osSoftware.some((o) => o.id === id)
}
