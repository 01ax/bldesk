import { components } from '@shared/api/schema'
import { MEMORY_GRAPH_KB, MEMORY_NOT_REPORTED_TEXT } from './metrics'
import { describeStatus } from './serverStatus'

export type HeatmapMetric = 'cpu' | 'ram' | 'disk' | 'netIn' | 'netOut' | 'ioRead' | 'ioWrite'
export type HeatmapCellState = 'ok' | 'not-reported' | 'stale' | 'off' | 'error' | 'no-sample' | 'pending' | 'capacity-unknown'
export type HeatmapSort = 'name' | 'region' | HeatmapMetric
export type HeatmapBucket = 0 | 1 | 2 | 3 | 4

type Server = components['schemas']['Server']
type SampleSet = components['schemas']['SampleSet']

export interface FleetMetricResult {
  sample: SampleSet | null
  error: string | null
}

export const STALE_AFTER_MS = 15 * 60 * 1000
export const HEAT_BUCKET_THRESHOLDS = [0.5, 0.7, 0.85, 0.95] as const

export interface HeatmapCell {
  state: HeatmapCellState
  raw: number | null
  ratio: number | null
  bucket: HeatmapBucket | null
  periodEnd: string | null
  ageMs: number | null
  tooltip: string
}

export interface HeatmapRow {
  server: Server
  name: string
  region: string
  cells: Record<HeatmapMetric, HeatmapCell>
}

const METRICS: HeatmapMetric[] = ['cpu', 'ram', 'disk', 'netIn', 'netOut', 'ioRead', 'ioWrite']

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function heatBucket(ratio: number): HeatmapBucket {
  const value = clamp(ratio)
  if (value < HEAT_BUCKET_THRESHOLDS[0]) return 0
  if (value < HEAT_BUCKET_THRESHOLDS[1]) return 1
  if (value < HEAT_BUCKET_THRESHOLDS[2]) return 2
  if (value < HEAT_BUCKET_THRESHOLDS[3]) return 3
  return 4
}

const cell = (
  state: HeatmapCellState,
  raw: number | null,
  ratio: number | null,
  periodEnd: string | null,
  ageMs: number | null,
  tooltip: string
): HeatmapCell => ({ state, raw, ratio: ratio == null ? null : clamp(ratio), bucket: ratio == null ? null : heatBucket(ratio), periodEnd, ageMs, tooltip })

const emptyCells = (state: HeatmapCellState, tooltip: string): Record<HeatmapMetric, HeatmapCell> =>
  Object.fromEntries(METRICS.map((metric) => [metric, cell(state, null, null, null, null, tooltip)])) as Record<HeatmapMetric, HeatmapCell>

const ageLabel = (ageMs: number) => {
  const minutes = Math.max(0, Math.floor(ageMs / 60_000))
  if (minutes < 60) return `${minutes}m old`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m old`
}

/**
 * The generated schema says 100% is the maximum across multiple processors,
 * but the API's own 365-day day-interval history returns totals above 100% on
 * multi-vCPU servers: a 6-vCPU server reached 172.0% in 9 of 200 daily sample
 * sets, and a 4-vCPU server reached 391.8% in 5 of 200. Contemporary totals
 * track the sum of per-vCPU values. CPU is therefore aggregate across vCPUs,
 * so fleet utilisation divides cpu_usage_percent by 100 * server.vcpus.
 */
export function buildHeatmapRows(
  servers: Server[],
  samples: Map<number, FleetMetricResult>,
  now = Date.now()
): HeatmapRow[] {
  const activeSamples = servers
    .filter((server) => server.status === 'active')
    .map((server) => samples.get(server.id)?.sample)
    .filter((sample): sample is SampleSet => {
      if (!sample) return false
      const end = Date.parse(sample.period.end)
      return Number.isFinite(end) && now - end <= STALE_AFTER_MS
    })
  const maxima = {
    netIn: Math.max(0, ...activeSamples.map((sample) => sample.average.network_incoming_kbps)),
    netOut: Math.max(0, ...activeSamples.map((sample) => sample.average.network_outgoing_kbps)),
    ioRead: Math.max(0, ...activeSamples.map((sample) => sample.average.storage_read_kbps)),
    ioWrite: Math.max(0, ...activeSamples.map((sample) => sample.average.storage_write_kbps))
  }

  return servers.map((server) => {
    const name = server.name || `Server ${server.id}`
    const region = server.region?.slug || server.region?.name || 'unknown'
    if (server.status !== 'active') {
      const label = describeStatus(server.status).label
      return { server, name, region, cells: emptyCells('off', label) }
    }
    const result = samples.get(server.id)
    if (!result) return { server, name, region, cells: emptyCells('pending', 'Loading') }
    if (result.error) return { server, name, region, cells: emptyCells('error', result.error) }
    const sample = result.sample
    if (!sample) return { server, name, region, cells: emptyCells('no-sample', 'No samples yet') }

    const endMs = Date.parse(sample.period.end)
    const ageMs = Number.isFinite(endMs) ? Math.max(0, now - endMs) : null
    const state: HeatmapCellState = ageMs == null || ageMs > STALE_AFTER_MS ? 'stale' : 'ok'
    const suffix = ageMs == null ? 'sample time unknown' : `${sample.period.end} (${ageLabel(ageMs)})`
    const average = sample.average
    const ramTotalBytes = server.memory * 1_048_576
    const diskTotalMb = server.disk * 1024
    const ratioCell = (raw: number, total: number, tooltip: string) => total > 0
      ? cell(state, raw, raw / total, sample.period.end, ageMs, `${tooltip}. Sample ended ${suffix}.`)
      : cell('capacity-unknown', null, null, sample.period.end, ageMs, 'Capacity unknown')
    const rateCell = (metric: keyof typeof maxima, raw: number) =>
      cell(state, raw, maxima[metric] > 0 ? raw / maxima[metric] : 0, sample.period.end, ageMs, `${formatRate(raw)}. Sample ended ${suffix}.`)

    const ram = average.memory_usage_bytes === 0
      ? cell('not-reported', 0, null, sample.period.end, ageMs, `${MEMORY_NOT_REPORTED_TEXT} ${MEMORY_GRAPH_KB}`)
      : ratioCell(average.memory_usage_bytes, ramTotalBytes, `${(average.memory_usage_bytes / 1_073_741_824).toFixed(1)} of ${(ramTotalBytes / 1_073_741_824).toFixed(1)} GB RAM`)

    return {
      server,
      name,
      region,
      cells: {
        cpu: ratioCell(average.cpu_usage_percent, 100 * server.vcpus, `${average.cpu_usage_percent.toFixed(1)} aggregate CPU points across ${server.vcpus} vCPU${server.vcpus === 1 ? '' : 's'}`),
        ram,
        disk: ratioCell(average.storage_usage_megabytes, diskTotalMb, `${(average.storage_usage_megabytes / 1024).toFixed(1)} of ${server.disk.toFixed(1)} GB disk`),
        netIn: rateCell('netIn', average.network_incoming_kbps),
        netOut: rateCell('netOut', average.network_outgoing_kbps),
        ioRead: rateCell('ioRead', average.storage_read_kbps),
        ioWrite: rateCell('ioWrite', average.storage_write_kbps)
      }
    }
  })
}

export function formatRate(value: number): string {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} MB/s` : `${value.toFixed(value < 10 ? 1 : 0)} KB/s`
}

export function sortHeatmapRows(rows: HeatmapRow[], sort: HeatmapSort, direction: 'asc' | 'desc'): HeatmapRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const ratioMetric = sort === 'cpu' || sort === 'ram' || sort === 'disk'
    const av = sort === 'name' ? a.name : sort === 'region' ? a.region : (ratioMetric ? a.cells[sort].ratio : a.cells[sort].raw)
    const bv = sort === 'name' ? b.name : sort === 'region' ? b.region : (ratioMetric ? b.cells[sort].ratio : b.cells[sort].raw)
    if (av == null && bv == null) return a.name.localeCompare(b.name) * sign
    if (av == null) return 1
    if (bv == null) return -1
    const primary = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return (primary === 0 ? a.name.localeCompare(b.name) : primary) * sign
  })
}
