import { describe, it, expect } from 'vitest'
import { configuredCost, preservedTransfer, retentionOptionLabel, type SizeLike } from './serverPricing'

/**
 * Pricing regressions are expensive and invisible: every figure here was wrong
 * in a way that still produced a plausible number, and two of them cannot be
 * caught against the live API because no plan currently exercises them.
 *
 * The three the review found:
 *   - backups charged on the raw retention total rather than what the plan
 *     already includes
 *   - offsite ignoring `offsite_backup_frequency_cost` entirely
 *   - transfer never priced at all
 *
 * Every offered size today includes zero backups, publishes zero for all three
 * offsite frequency rates and caps `transfer_max` at its included transfer - so
 * these tests use sizes shaped the way the API allows rather than the way it
 * currently happens to be configured. That is the point: they fail if someone
 * "simplifies" the formula back.
 */

const size = (over: Partial<SizeLike> = {}): SizeLike => ({
  slug: 'test',
  memory: 4096,
  disk: 60,
  vcpus: 2,
  transfer: 3,
  price_monthly: 20,
  options: {
    memory_max: 8192,
    memory_cost_per_additional_megabyte: 0,
    disk_max: 200,
    disk_cost_per_additional_gigabyte: 0,
    ipv4_addresses_max: 8,
    ipv4_addresses_cost_per_address: 2,
    daily_backups: 0,
    weekly_backups: 0,
    monthly_backups: 0,
    backups_cost_per_backup_per_gigabyte: 0.05,
    offsite_backups_cost_per_gigabyte: 0.05,
    offsite_backup_frequency_cost: { daily_per_gigabyte: 0, weekly_per_gigabyte: 0, monthly_per_gigabyte: 0 },
    transfer_max: 3,
    transfer_cost_per_additional_gigabyte: 0.01,
    ...(over.options ?? {})
  },
  ...over
})

const base = {
  memoryMb: 4096,
  diskGb: 60,
  ipCount: 1,
  dailyBackups: 0,
  weeklyBackups: 0,
  monthlyBackups: 0,
  offsiteBackups: false
}

describe('configuredCost', () => {
  it('is just the plan price when nothing is added', () => {
    expect(configuredCost({ size: size(), ...base }).total).toBe(20)
  })

  it('charges per additional address, the first being included', () => {
    expect(configuredCost({ size: size(), ...base, ipCount: 3 }).addresses).toBe(4)
  })

  it('charges every selected backup when the plan includes none', () => {
    // 4 backups x 60 GB x $0.05
    const c = configuredCost({ size: size(), ...base, dailyBackups: 1, weeklyBackups: 2, monthlyBackups: 1 })
    expect(c.backups).toBeCloseTo(12, 5)
  })

  it('does not charge for retention the plan already includes', () => {
    const s = size({ options: { ...size().options, daily_backups: 2, weekly_backups: 1 } })
    // daily 3 selected - 2 included = 1; weekly 1 - 1 = 0; monthly 1 - 0 = 1.
    // So 2 chargeable, not the 5 a raw total would bill.
    const c = configuredCost({ size: s, ...base, dailyBackups: 3, weeklyBackups: 1, monthlyBackups: 1 })
    expect(c.backups).toBeCloseTo(2 * 60 * 0.05, 5)
  })

  it('never charges a negative amount when fewer backups are kept than included', () => {
    const s = size({ options: { ...size().options, daily_backups: 5 } })
    const c = configuredCost({ size: s, ...base, dailyBackups: 1 })
    expect(c.backups).toBe(0)
  })

  it('picks the offsite frequency rate by priority, not by which rate is largest', () => {
    // The case that tells the two rules apart: daily is enabled but publishes a
    // LOWER rate than weekly. The panel takes daily because it comes first;
    // Math.max would take weekly. Every offered size publishes 0.0 for all
    // three today, so only a test can hold this down.
    const s = size({
      options: {
        ...size().options,
        offsite_backup_frequency_cost: {
          daily_per_gigabyte: 0.01,
          weekly_per_gigabyte: 0.05,
          monthly_per_gigabyte: 0.0
        }
      }
    })
    // 3 backups x 60 x 0.05 = 9, plus the DAILY rate 0.01 x 60 = 0.6
    const c = configuredCost({ size: s, ...base, dailyBackups: 1, weeklyBackups: 2, offsiteBackups: true })
    expect(c.offsite).toBeCloseTo(9 + 0.6, 5)
  })

  it('falls to weekly, then monthly, when the higher frequencies are off', () => {
    const s = size({
      options: {
        ...size().options,
        offsite_backup_frequency_cost: {
          daily_per_gigabyte: 0.1,
          weekly_per_gigabyte: 0.02,
          monthly_per_gigabyte: 0.01
        }
      }
    })
    // Daily off, weekly on -> the weekly rate, never the larger daily one.
    expect(
      configuredCost({ size: s, ...base, weeklyBackups: 2, monthlyBackups: 1, offsiteBackups: true }).offsite
    ).toBeCloseTo(3 * 60 * 0.05 + 0.02 * 60, 5)
    // Daily and weekly off -> monthly.
    expect(configuredCost({ size: s, ...base, monthlyBackups: 1, offsiteBackups: true }).offsite).toBeCloseTo(
      1 * 60 * 0.05 + 0.01 * 60,
      5
    )
  })

  it('does not deduct plan inclusions from the offsite storage term, unlike on-site', () => {
    // The panel's `numberOfBackups` sums the raw selected counts. On-site
    // subtracts inclusions; offsite does not. Deliberately asymmetric.
    const s = size({ options: { ...size().options, daily_backups: 2 } })
    const c = configuredCost({ size: s, ...base, dailyBackups: 3, offsiteBackups: true })
    expect(c.backups).toBeCloseTo(1 * 60 * 0.05, 5) // 3 - 2 included
    expect(c.offsite).toBeCloseTo(3 * 60 * 0.05, 5) // all 3
  })

  it('adds the enabled offsite frequency rate on top of the per-GB storage', () => {
    const s = size({
      options: {
        ...size().options,
        offsite_backup_frequency_cost: {
          daily_per_gigabyte: 0.1,
          weekly_per_gigabyte: 0.02,
          monthly_per_gigabyte: 0.01
        }
      }
    })
    // Only weekly and monthly are on, so the daily rate must not apply:
    // 3 backups x 60 x 0.05 = 9, plus max(0.02, 0.01) x 60 = 1.2
    const c = configuredCost({ size: s, ...base, weeklyBackups: 2, monthlyBackups: 1, offsiteBackups: true })
    expect(c.offsite).toBeCloseTo(9 + 1.2, 5)
  })

  it('charges no offsite when offsite is off, however the rates are set', () => {
    const s = size({
      options: {
        ...size().options,
        offsite_backup_frequency_cost: {
          daily_per_gigabyte: 0.1,
          weekly_per_gigabyte: 0.1,
          monthly_per_gigabyte: 0.1
        }
      }
    })
    expect(configuredCost({ size: s, ...base, dailyBackups: 2, offsiteBackups: false }).offsite).toBe(0)
  })

  it('charges no offsite when nothing is kept on site to copy', () => {
    expect(configuredCost({ size: size(), ...base, offsiteBackups: true }).offsite).toBe(0)
  })

  it('prices transfer above the plan allowance, per GB', () => {
    const s = size({ options: { ...size().options, transfer_max: 10 } })
    // 5 TB selected - 3 included = 2 TB = 2000 GB x $0.01
    expect(configuredCost({ size: s, ...base, transferTb: 5 }).transfer).toBeCloseTo(20, 5)
  })

  it('treats the plan allowance as the default when no transfer is given', () => {
    expect(configuredCost({ size: size(), ...base }).transfer).toBe(0)
  })

  it('adds licences straight through', () => {
    expect(configuredCost({ size: size(), ...base, licencesMonthly: 18.18 }).total).toBeCloseTo(38.18, 5)
  })

  it('totals its own parts', () => {
    const s = size({ options: { ...size().options, transfer_max: 10, daily_backups: 1 } })
    const c = configuredCost({
      size: s,
      ...base,
      ipCount: 2,
      dailyBackups: 2,
      offsiteBackups: true,
      transferTb: 4,
      licencesMonthly: 9.09
    })
    const parts =
      c.plan + c.memory + c.disk + c.surcharge + c.addresses + c.backups + c.offsite + c.transfer + c.licences
    expect(c.total).toBeCloseTo(parts, 10)
  })
})

describe('preservedTransfer', () => {
  it('keeps the existing allowance when the target permits it', () => {
    expect(preservedTransfer(size({ options: { ...size().options, transfer_max: 10 } }), 6)).toBe(6)
  })

  it('clamps down to the target maximum', () => {
    // The case that would 400: a retired plan carrying 4 TB onto a plan capped
    // at its included 3.
    expect(preservedTransfer(size(), 4)).toBe(3)
  })

  it('raises up to the target minimum rather than under-requesting', () => {
    expect(preservedTransfer(size({ transfer: 5, options: { ...size().options, transfer_max: 10 } }), 2)).toBe(5)
  })

  it('falls back to the plan allowance when the server has none recorded', () => {
    expect(preservedTransfer(size(), null)).toBe(3)
    expect(preservedTransfer(size(), undefined)).toBe(3)
  })
})

describe('retentionOptionLabel', () => {
  it('matches the web panel for none', () => {
    expect(retentionOptionLabel('daily', 0, 40, size())).toBe('Do not take a daily backup')
    expect(retentionOptionLabel('weekly', 0, 40, size())).toBe('Do not take a weekly backup')
  })

  it('matches the web panel for one, singular unit and price', () => {
    // 1 x 40 GB x $0.05 = $2.00, as mPanel shows.
    expect(retentionOptionLabel('daily', 1, 40, size())).toBe(
      'Take daily backups, stored for 1 day (+$2.00 per month)'
    )
  })

  it('pluralises each frequency in its own unit, not "periods"', () => {
    expect(retentionOptionLabel('daily', 3, 40, size())).toBe(
      'Take daily backups, stored for 3 days (+$6.00 per month)'
    )
    expect(retentionOptionLabel('weekly', 2, 40, size())).toBe(
      'Take weekly backups, stored for 2 weeks (+$4.00 per month)'
    )
    expect(retentionOptionLabel('monthly', 10, 40, size())).toBe(
      'Take monthly backups, stored for 10 months (+$20.00 per month)'
    )
  })

  it('does not price retention the plan already includes', () => {
    const s = size({ options: { ...size().options, daily_backups: 2 } })
    expect(retentionOptionLabel('daily', 3, 40, s)).toBe('Take daily backups, stored for 3 days (+$2.00 per month)')
  })
})
