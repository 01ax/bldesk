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
  /** Image slugs this software can be licensed on. Absent on older payloads. */
  supported_operating_systems?: string[] | null
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
   *
   * The API marks it structurally: "a software in each group with a
   * licence_step_count value of -1 that may be selected to indicate the
   * software from that group is not required". The name is only a fallback.
   */
  optOut: SoftwareLike | null
  /**
   * No opt-out member means the API insists on one of the options: it rejects
   * the whole resize with "One item from the software group 'cPanel' must be
   * selected". Reachable by moving an unlicensed server onto a cPanel image.
   */
  required: boolean
}

export const isOptOut = (s: SoftwareLike): boolean => s.licence_step_count === -1

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
        const optOut = sorted.find(isOptOut) ?? sorted.find((o) => /\bnot required\b/i.test(o.name)) ?? null
        return { name, options: sorted, optOut, required: !optOut }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    addons: addons.sort(byCost)
  }
}

/** The option currently selected within a group, if any. */
export function selectedInGroup(g: LicenceGroup, selection: LicenceSelection): SoftwareLike | undefined {
  return g.options.find((o) => (selection[o.id] ?? 0) > 0)
}

/**
 * Cheapest real (non-opt-out) member of a group - what a required group falls
 * back to, mirroring the web panel rather than leaving it blank. On the cPanel
 * images the cheapest tier is $0, so defaulting costs nothing.
 */
export function cheapestOption(g: LicenceGroup): SoftwareLike | undefined {
  return g.options.filter((o) => !isOptOut(o))[0]
}

/**
 * Fill in any required group that has nothing selected.
 *
 * Returns the *same* object when nothing needs adding, so callers can use it in
 * a render or an effect without looping.
 */
export function withRequiredDefaults(groups: LicenceGroup[], selection: LicenceSelection): LicenceSelection {
  let next: LicenceSelection | null = null
  for (const g of groups) {
    if (!g.required || selectedInGroup(g, selection)) continue
    const pick = cheapestOption(g)
    if (!pick) continue
    next = next ?? { ...selection }
    next[pick.id] = pick.minimum_licence_count || 1
  }
  return next ?? selection
}

/**
 * Required groups still without a choice. Non-empty means the API would reject
 * the resize, so the submit is held rather than the error discovered after the
 * confirmation.
 */
export function unsatisfiedGroups(groups: LicenceGroup[], selection: LicenceSelection): LicenceGroup[] {
  return groups.filter((g) => g.required && !selectedInGroup(g, selection))
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

/**
 * The `change_licenses.licenses` array.
 *
 * The opt-out sentinel is filtered out here as well as being cleared by the
 * group control, because sending it is accepted and then not persisted: the
 * server comes back with zero licences, so the panel would report a change that
 * never stuck and offer it again forever. Keeping the rule in one place means a
 * future caller cannot reintroduce it by building a selection differently.
 *
 * `offered` is optional so existing callers keep working; without it the
 * sentinel cannot be recognised, since only the catalogue carries the step
 * count.
 */
export function toLicencePayload(
  selection: LicenceSelection,
  offered: SoftwareLike[] = []
): Array<{ software_id: number; count: number }> {
  return Object.entries(selection)
    .filter(([id, count]) => {
      if (count <= 0) return false
      const s = offered.find((o) => o.id === Number(id))
      return !s || !isOptOut(s)
    })
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
 *
 * When the server is being reinstalled onto `targetOs`, a held licence is kept
 * on offer only if its own `supported_operating_systems` says the new image
 * can carry it. A held licence that does not say (older payloads) is kept too:
 * if the new image cannot carry it, the API rejects the request visibly,
 * which beats this form silently dropping a licence that cannot be re-bought.
 */
export function offerableSoftware(
  osSoftware: SoftwareLike[],
  licensed: Array<{ software: SoftwareLike; licence_count: number; incompatible: boolean }>,
  targetOs?: string | null
): SoftwareLike[] {
  const out = [...osSoftware]
  for (const l of licensed) {
    if (l.incompatible || out.some((o) => o.id === l.software.id)) continue
    const supported = l.software.supported_operating_systems
    if (targetOs && supported?.length && !supported.includes(targetOs)) continue
    out.push(l.software)
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
