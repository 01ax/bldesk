import { describe, it, expect } from 'vitest'
import {
  isOptOut,
  splitSoftware,
  selectedInGroup,
  cheapestOption,
  withRequiredDefaults,
  unsatisfiedGroups,
  licenceCost,
  currentSelection,
  currentLicenceCost,
  toLicencePayload,
  offerableSoftware,
  countChoices,
  type SoftwareLike
} from './licences'

/**
 * The rules here are the API's, not ours, and getting them wrong submits a
 * resize the platform rejects - or worse, one it accepts that drops a licence
 * that cannot be re-bought.
 *
 * Shapes taken from the live catalogue: `licence_step_count: -1` marks the
 * opt-out sentinel and is the only negative value in all 67 entries; a group
 * with no such member is required, which is exactly the cPanel images.
 */

const sw = (over: Partial<SoftwareLike> & { id: number }): SoftwareLike => ({
  name: 'Thing',
  group: null,
  cost_per_licence_per_month: 0,
  minimum_licence_count: 1,
  maximum_licence_count: 1,
  licence_step_count: 1,
  ...over
})

// An optional group, as ubuntu-24.04 / alma-9 / alma-10 report it.
const optionalGroup: SoftwareLike[] = [
  sw({ id: 105, name: 'cPanel: Not required', group: 'cPanel', licence_step_count: -1 }),
  sw({ id: 170, name: 'cPanel: Up to 5 Accounts', group: 'cPanel', cost_per_licence_per_month: 40 }),
  sw({ id: 171, name: 'cPanel: Up to 30 Accounts', group: 'cPanel', cost_per_licence_per_month: 65 })
]

// A required group, as the cPanel images report it: no sentinel, cheapest free.
const requiredGroup: SoftwareLike[] = [
  sw({ id: 159, name: 'cPanel: Up to 5 Accounts', group: 'cPanel', cost_per_licence_per_month: 0 }),
  sw({ id: 162, name: 'cPanel: Up to 30 Accounts', group: 'cPanel', cost_per_licence_per_month: 12 })
]

const sal = sw({
  id: 127,
  name: 'Remote Desktop SAL',
  enabled: false,
  cost_per_licence_per_month: 9.09,
  maximum_licence_count: 50
})

describe('isOptOut', () => {
  it('is the negative step count, not the display name', () => {
    expect(isOptOut(sw({ id: 1, licence_step_count: -1 }))).toBe(true)
    expect(isOptOut(sw({ id: 2, name: 'Not required', licence_step_count: 1 }))).toBe(false)
  })
})

describe('splitSoftware', () => {
  it('marks a group with a sentinel as optional', () => {
    const { groups } = splitSoftware(optionalGroup)
    expect(groups[0].required).toBe(false)
    expect(groups[0].optOut?.id).toBe(105)
  })

  it('marks a group with no sentinel as required', () => {
    const { groups } = splitSoftware(requiredGroup)
    expect(groups[0].required).toBe(true)
    expect(groups[0].optOut).toBeNull()
  })

  it('separates ungrouped add-ons from groups', () => {
    const { groups, addons } = splitSoftware([...requiredGroup, sal])
    expect(groups).toHaveLength(1)
    expect(addons.map((a) => a.id)).toEqual([127])
  })
})

describe('withRequiredDefaults', () => {
  it('fills a required group with its cheapest real option', () => {
    const { groups } = splitSoftware(requiredGroup)
    // This is the blocker: an unlicensed server moved onto a cPanel image would
    // otherwise submit with no cPanel licence and be rejected.
    expect(withRequiredDefaults(groups, {})).toEqual({ 159: 1 })
  })

  it('leaves an optional group alone', () => {
    const { groups } = splitSoftware(optionalGroup)
    expect(withRequiredDefaults(groups, {})).toEqual({})
  })

  it('does not override an existing choice', () => {
    const { groups } = splitSoftware(requiredGroup)
    expect(withRequiredDefaults(groups, { 162: 1 })).toEqual({ 162: 1 })
  })

  it('returns the same object when nothing needs adding, so effects cannot loop', () => {
    const { groups } = splitSoftware(optionalGroup)
    const sel = { 171: 1 }
    expect(withRequiredDefaults(groups, sel)).toBe(sel)
  })

  it('never picks the opt-out sentinel as a default', () => {
    const { groups } = splitSoftware([
      sw({ id: 9, name: 'G: none', group: 'G', licence_step_count: -1 }),
      sw({ id: 10, name: 'G: paid', group: 'G', cost_per_licence_per_month: 5 })
    ])
    // Optional, so nothing is filled; but if it were required the sentinel is
    // still not a valid default.
    expect(cheapestOption(groups[0])?.id).toBe(10)
  })
})

describe('unsatisfiedGroups', () => {
  it('reports a required group with nothing selected', () => {
    const { groups } = splitSoftware(requiredGroup)
    expect(unsatisfiedGroups(groups, {}).map((g) => g.name)).toEqual(['cPanel'])
  })

  it('is empty once the group has a choice', () => {
    const { groups } = splitSoftware(requiredGroup)
    expect(unsatisfiedGroups(groups, { 162: 1 })).toEqual([])
  })

  it('never reports an optional group', () => {
    const { groups } = splitSoftware(optionalGroup)
    expect(unsatisfiedGroups(groups, {})).toEqual([])
  })
})

describe('selectedInGroup', () => {
  it('ignores a zero count', () => {
    const { groups } = splitSoftware(requiredGroup)
    expect(selectedInGroup(groups[0], { 159: 0 })).toBeUndefined()
  })
})

describe('licenceCost', () => {
  it('multiplies by the count', () => {
    expect(licenceCost([sal], { 127: 3 })).toBeCloseTo(27.27, 5)
  })

  it('treats the opt-out sentinel as free', () => {
    expect(licenceCost(optionalGroup, { 105: 1 })).toBe(0)
  })
})

describe('currentSelection and currentLicenceCost', () => {
  const held = [
    { software: sal, licence_count: 2, incompatible: false },
    { software: sw({ id: 999, name: 'Gone', cost_per_licence_per_month: 5 }), licence_count: 1, incompatible: true }
  ]

  it('drops incompatible licences, which the API removes anyway', () => {
    expect(currentSelection(held)).toEqual({ 127: 2 })
  })

  it('prices only what is kept', () => {
    expect(currentLicenceCost(held)).toBeCloseTo(18.18, 5)
  })
})

describe('toLicencePayload', () => {
  it('omits the opt-out sentinel, which the API accepts and does not persist', () => {
    expect(toLicencePayload({ 105: 1, 171: 1 }, optionalGroup)).toEqual([{ software_id: 171, count: 1 }])
  })

  it('omits zero counts', () => {
    expect(toLicencePayload({ 127: 0 }, [sal])).toEqual([])
  })
})

describe('offerableSoftware', () => {
  it('keeps a held licence the catalogue no longer lists', () => {
    // Remote Desktop SAL is enabled:false, so it is in no catalogue; dropping it
    // from the payload would strip it permanently.
    const offered = offerableSoftware([], [{ software: sal, licence_count: 2, incompatible: false }])
    expect(offered.map((o) => o.id)).toEqual([127])
  })

  it('does not duplicate one that is both held and on offer', () => {
    const offered = offerableSoftware(requiredGroup, [
      { software: requiredGroup[1], licence_count: 1, incompatible: false }
    ])
    expect(offered.filter((o) => o.id === 162)).toHaveLength(1)
  })
})

describe('countChoices', () => {
  it('walks min to max by step', () => {
    expect(countChoices(sw({ id: 1, minimum_licence_count: 1, maximum_licence_count: 4 }))).toEqual([1, 2, 3, 4])
  })

  it('gives the sentinel a single choice rather than a quantity', () => {
    expect(countChoices(sw({ id: 105, licence_step_count: -1 }))).toEqual([1])
  })
})
