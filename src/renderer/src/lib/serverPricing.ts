/**
 * Pricing and availability for the create-server form.
 *
 * A plan's `price_monthly` is the base only. Licensed images add a surcharge that
 * the web panel folds into the displayed price, so showing `price_monthly` alone
 * understates Windows by roughly half.
 *
 * Derived from the published figures and confirmed against them:
 *
 *   Windows Server 2025 (surcharge_per_memory_megabyte 0.0048828125, capped at 8192 MB)
 *     std-1vcpu   2048 MB    9.80 + 2048*0.0048828125 =  19.80
 *     std-2vcpu   4096 MB   19.60 + 4096*0.0048828125 =  39.60
 *     std-4vcpu   8192 MB   39.20 + 8192*0.0048828125 =  79.20
 *     std-6vcpu  16384 MB   78.40 + 8192*0.0048828125 = 118.40   (capped)
 *     std-8vcpu  32768 MB  156.80 + 8192*0.0048828125 = 196.80   (capped)
 *
 *   cPanel+WHM  surcharge_base_cost 40  ->  flat +40.00
 */

export interface DistributionSurcharges {
  surcharge_base_cost?: number | null
  surcharge_per_memory_megabyte?: number | null
  surcharge_per_memory_max_megabytes?: number | null
  surcharge_per_vcpu?: number | null
  surcharge_min_vcpu?: number | null
}

export interface SizeLike {
  slug: string
  memory: number
  disk: number
  vcpus: number
  vcpu_units?: string | null
  transfer: number
  storage_description?: string | null
  cpu_description?: string | null
  price_monthly: number
  available?: boolean
  regions?: string[] | null
  regions_out_of_stock?: string[] | null
  size_type?: { slug?: string; name?: string } | null
  options?: Record<string, any> | null
}

export interface ImageLike {
  slug?: string | null
  distribution?: string | null
  min_disk_size?: number | null
  min_memory_megabytes?: number | null
  regions?: string[] | null
  distribution_surcharges?: DistributionSurcharges | null
}

/** Image surcharge for a given amount of memory and vCPU count. */
export function imageSurcharge(image: ImageLike | undefined, memoryMb: number, vcpus: number): number {
  const s = image?.distribution_surcharges
  if (!s) return 0
  let total = s.surcharge_base_cost || 0
  if (s.surcharge_per_memory_megabyte) {
    const cap = s.surcharge_per_memory_max_megabytes ?? memoryMb
    total += Math.min(memoryMb, cap) * s.surcharge_per_memory_megabyte
  }
  if (s.surcharge_per_vcpu) {
    // Licensing that scales with cores is billed from a floor, not from zero.
    const billable = Math.max(vcpus, s.surcharge_min_vcpu ?? 0)
    total += billable * s.surcharge_per_vcpu
  }
  return total
}

/** Monthly price of a plan including any image surcharge, at the chosen memory/disk. */
export function planMonthlyPrice(
  size: SizeLike,
  image: ImageLike | undefined,
  memoryMb: number,
  diskGb: number
): number {
  const o = size.options || {}
  const extraMemory = Math.max(0, memoryMb - size.memory) * (o.memory_cost_per_additional_megabyte || 0)
  const extraDisk = Math.max(0, diskGb - size.disk) * (o.disk_cost_per_additional_gigabyte || 0)
  return size.price_monthly + extraMemory + extraDisk + imageSurcharge(image, memoryMb, size.vcpus)
}

/**
 * Why a plan can't be used right now, or null when it can.
 *
 * `available` is the plan being offered at all; `regions_out_of_stock` is the
 * per-region capacity that the web panel greys rows out for. An image's minimums
 * exclude plans too, which is why Windows shows five rows where Ubuntu shows six.
 */
export function planUnavailableReason(
  size: SizeLike,
  region: string,
  image: ImageLike | undefined
): string | null {
  if (size.available === false) return 'This plan is no longer offered.'
  if (size.regions && !size.regions.includes(region)) return 'Not offered in this region.'
  if (size.regions_out_of_stock?.includes(region)) return 'Out of stock in this region.'
  if (image?.min_memory_megabytes && size.memory < image.min_memory_megabytes) {
    return `${image.distribution || 'This image'} needs at least ${image.min_memory_megabytes / 1024} GB memory.`
  }
  if (image?.min_disk_size && (size.options?.disk_max ?? size.disk) < image.min_disk_size) {
    return `${image.distribution || 'This image'} needs at least ${image.min_disk_size} GB storage.`
  }
  return null
}

/** Selectable memory steps for a plan: doubling from the included amount to the cap. */
export function memoryChoices(size: SizeLike): number[] {
  const max = size.options?.memory_max ?? size.memory
  const out: number[] = []
  for (let m = size.memory; m <= max; m *= 2) out.push(m)
  if (!out.includes(max)) out.push(max)
  return out
}

/** Selectable storage steps, honouring restricted_disk_values where the plan sets them. */
export function diskChoices(size: SizeLike): number[] {
  const o = size.options || {}
  if (Array.isArray(o.restricted_disk_values) && o.restricted_disk_values.length) {
    return o.restricted_disk_values as number[]
  }
  const min = o.disk_min ?? size.disk
  const max = o.disk_max ?? size.disk
  if (min === max) return [min]
  // Round steps so the list reads like the web panel rather than arbitrary numbers.
  const step = min >= 500 ? 500 : min >= 100 ? 100 : 20
  const out: number[] = []
  for (let d = size.disk; d <= max; d += step) out.push(d)
  if (!out.includes(max)) out.push(max)
  return out.slice(0, 24)
}

export const GST_RATE = 0.1

/** Monthly total shown in the billing summary, inclusive of GST. */
export function billingTotal(monthlyExGst: number): { total: number; gst: number } {
  const gst = monthlyExGst * GST_RATE
  return { total: monthlyExGst + gst, gst }
}

/**
 * Order image versions the way the web panel presents them: newest first, with a
 * base release ahead of its licensed variants.
 *
 * The API returns images in no meaningful order (AlmaLinux 10, 8, 9 ... Ubuntu
 * 22.04, 24.04, 26.04 ... then 20.04.6 and 22.04 Desktop much later), so the
 * order has to be imposed here. This is presentation only — nothing depends on it.
 *
 * Matches the published lists:
 *   Ubuntu   26.04 LTS, 24.04 LTS, 22.04 LTS, 22.04 Desktop, 20.04.6 LTS
 *   Windows  Server 2025, Server 2022, 2022 + SQL Standard, 2022 + SQL Web,
 *            Server 2019, 2019 + SQL Standard, 2019 + SQL Web, Server 2016, ...
 */
export function compareVersionNames(a: string, b: string): number {
  const versionOf = (s: string) => {
    const m = s.match(/(\d+(?:\.\d+)*)/)
    if (!m) return [] as number[]
    return m[1].split('.').map(Number)
  }
  const va = versionOf(a)
  const vb = versionOf(b)
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? 0) - (va[i] ?? 0) // descending: newest first
    if (d !== 0) return d
  }
  // Same release: long-term support ahead of desktop or other spins.
  const lts = (s: string) => (/LTS/i.test(s) ? 0 : 1)
  if (lts(a) !== lts(b)) return lts(a) - lts(b)
  // Base release ahead of "+ SQL Server ..." style variants.
  const variant = (s: string) => (s.includes('+') ? 1 : 0)
  if (variant(a) !== variant(b)) return variant(a) - variant(b)
  return a.localeCompare(b)
}
