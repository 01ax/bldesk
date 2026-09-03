import React, { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Loader2, Route } from 'lucide-react'
import type { TcpProbeResult, TracerouteHop } from '@shared/ipc-types'
import type { BinaryLaneClient } from '../../api/client'
import { useFirewallRules } from '../../api/queries'
import { explainUnreachablePort, describeRule, type FirewallVerdict } from '../../lib/firewallMatch'

/**
 * Reachability from the user's own machine (FEATURES.md #11).
 *
 * mPanel can say a server is running; only something running where the customer
 * is can say whether *they* can reach it. That difference is the whole point, so
 * this reports what happened from here and does not dress it up as a verdict
 * about the server.
 *
 * Split into a chip and a notice on purpose. The chip is one line and leads the
 * action cluster it qualifies - "Launch SSH" is only worth clicking if 22 answers
 * from here - while the explanation can run to three lines and would squeeze
 * those buttons if it shared their row.
 *
 * The three probe outcomes are kept distinct because they have different fixes:
 *   connected -> latency
 *   refused   -> something answered; the host is up, sshd is not
 *   timeout   -> silently dropped, which is what a firewall does
 *
 * Electron only. The Android build has no raw sockets and no child_process, so
 * `probeTcp` is absent there and both pieces render nothing rather than offering
 * a control that cannot work.
 */
export interface Reachability {
  supported: boolean
  result: TcpProbeResult | null
  busy: boolean
  port: number
  probe: () => Promise<void>
  verdict: FirewallVerdict
  hops: TracerouteHop[] | null
  tracing: boolean
  runTrace: () => Promise<void>
}

export function useReachability(
  ip: string | undefined,
  port: number,
  client?: BinaryLaneClient | null,
  serverId?: number
): Reachability {
  const api = typeof window !== 'undefined' ? window.bldeskApi : undefined
  const supported = typeof api?.probeTcp === 'function'

  const [result, setResult] = useState<TcpProbeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [hops, setHops] = useState<TracerouteHop[] | null>(null)
  const [tracing, setTracing] = useState(false)

  const probe = useCallback(async () => {
    if (!supported || !ip) return
    setBusy(true)
    try {
      setResult((await api!.probeTcp!(ip, port, 4000)) ?? null)
    } finally {
      setBusy(false)
    }
  }, [api, ip, port, supported])

  useEffect(() => {
    setResult(null)
    setHops(null)
    void probe()
  }, [probe])

  const timedOut = !!result && !result.ok && result.error === 'timeout'
  // Fetched only once a timeout has happened, so a healthy server never pulls
  // firewall rules it has no use for.
  const rulesQuery = useFirewallRules(client ?? null, timedOut && serverId ? serverId : null)
  const verdict = explainUnreachablePort(timedOut ? rulesQuery.data : undefined, port)

  const runTrace = useCallback(async () => {
    if (!supported || !ip) return
    setTracing(true)
    try {
      setHops((await api!.traceroute!(ip, 12)) ?? [])
    } finally {
      setTracing(false)
    }
  }, [api, ip, supported])

  return { supported, result, busy, port, probe, verdict, hops, tracing, runTrace }
}

const pill = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium'

/** One line, leading the action buttons. */
export const ReachabilityChip: React.FC<{ r: Reachability; ip?: string }> = ({ r, ip }) => {
  if (!r.supported || !ip) return null
  const { result, busy, port } = r

  return (
    <span className="inline-flex items-center gap-2">
      {busy && (
        <span className={`${pill} bg-[#e9ecef] dark:bg-[#343a40] text-[#6c757d] dark:text-slate-400`}>
          <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
          Checking {port}…
        </span>
      )}

      {!busy && result?.ok && (
        <span
          title={`TCP connect to port ${port} from this machine`}
          className={`${pill} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}
        >
          <Activity className="w-3 h-3 shrink-0" />
          {result.latencyMs?.toFixed(0)} ms from here
        </span>
      )}

      {!busy && result && !result.ok && (
        <span
          className={`${pill} ${
            result.error === 'refused'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
          }`}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {result.error === 'refused'
            ? `Port ${port} refused`
            : result.error === 'invalid-target'
              ? 'Not probeable'
              : `Port ${port} unreachable`}
        </span>
      )}

      {!busy && (
        <button type="button" onClick={() => void r.probe()} className="text-[11px] text-[#017cb6] hover:underline">
          Re-check
        </button>
      )}
    </span>
  )
}

/**
 * The explanation, on its own line below the buttons.
 *
 * A timeout is the only case a firewall rule can explain, and even then only if a
 * rule actually covers the port - saying "check your firewall rules" when none do
 * sends the reader hunting for something that does not exist, while the real
 * cause sits in the guest or the path.
 */
export const ReachabilityNotice: React.FC<{ r: Reachability; onOpenFirewall?: () => void }> = ({
  r,
  onOpenFirewall
}) => {
  const { result, busy, port, verdict, hops, tracing } = r
  if (!r.supported || busy || !result || result.ok || result.error !== 'timeout') return null

  return (
    <div className="mt-2 text-[11px] text-[#6c757d] dark:text-slate-400 space-y-1 max-w-3xl">
      {verdict.kind === 'blocked' && (
        <div className="flex items-start gap-2 flex-wrap">
          <span>
            A firewall rule drops this: <span className="font-mono">{describeRule(verdict.rule)}</span>
            {verdict.rule.description ? ` — “${verdict.rule.description}”` : ''} (rule {verdict.index + 1}).
          </span>
          {onOpenFirewall && (
            <button type="button" onClick={onOpenFirewall} className="text-[#017cb6] hover:underline">
              Open firewall rules
            </button>
          )}
        </div>
      )}

      {verdict.kind === 'no-rules' && (
        <span>
          No BinaryLane firewall rules are set for this server, so nothing is filtered at their end. The drop is the
          server&apos;s own firewall or the path in between.
        </span>
      )}

      {verdict.kind === 'no-matching-rule' && (
        <span>
          No BinaryLane rule blocks port {port}, so check the server&apos;s own firewall — ufw or nftables on Linux,
          Windows Defender Firewall on Windows.
        </span>
      )}

      {verdict.kind === 'unknown' && (
        <span>Port {port} did not answer from this network. Nothing was refused, which is what a drop looks like.</span>
      )}

      <div>
        <button
          type="button"
          onClick={() => void r.runTrace()}
          disabled={tracing}
          className="inline-flex items-center gap-1 text-[#017cb6] hover:underline disabled:opacity-50"
        >
          {tracing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Route className="w-3 h-3" />}
          <span>{tracing ? 'Tracing…' : 'Trace route'}</span>
        </button>
      </div>

      {hops && hops.length > 0 && (
        <div className="mt-1 rounded border border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529] p-2 max-h-40 overflow-y-auto">
          <table className="text-[11px] font-mono w-full">
            <tbody>
              {hops.map((h) => (
                <tr key={h.hop} className="text-[#495057] dark:text-slate-300">
                  <td className="pr-3 text-right w-8">{h.hop}</td>
                  <td className="pr-3">{h.timedOut ? '*' : h.host || '—'}</td>
                  <td className="text-right">{h.latencyMs !== undefined ? `${h.latencyMs} ms` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-[#6c757d] dark:text-slate-500 font-sans">
            Traced from this machine — paste into a support ticket to show where the path stops.
          </p>
        </div>
      )}
      {hops && hops.length === 0 && !tracing && (
        <p>Traceroute returned nothing — the system tool may be unavailable here.</p>
      )}
    </div>
  )
}
