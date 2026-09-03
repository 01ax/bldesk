import React, { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Loader2, Route } from 'lucide-react'
import type { TcpProbeResult, TracerouteHop } from '@shared/ipc-types'
import type { BinaryLaneClient } from '../../api/client'
import { useFirewallRules } from '../../api/queries'
import { explainUnreachablePort, describeRule } from '../../lib/firewallMatch'

/**
 * Reachability from the user's own machine (FEATURES.md #11).
 *
 * mPanel can say a server is running; only something running where the customer
 * is can say whether *they* can reach it. That difference is the whole point, so
 * this reports what happened from here and does not dress it up as a verdict
 * about the server.
 *
 * The three outcomes are deliberately distinct, because they have different
 * fixes:
 *   - connected      -> latency
 *   - refused        -> something answered; the host is up, sshd is not
 *   - timeout        -> silently dropped, which is what a firewall does
 *
 * Electron only. The Android build has no raw sockets and no child_process, so
 * `probeTcp` is absent there and this renders nothing rather than offering a
 * button that cannot work.
 */
export const ReachabilityBadge: React.FC<{
  ip?: string
  port?: number
  client?: BinaryLaneClient | null
  serverId?: number
  /** Opens the firewall view; offered only when a rule could explain the drop. */
  onOpenFirewall?: () => void
}> = ({ ip, port = 22, client, serverId, onOpenFirewall }) => {
  // Only fetched once a timeout has actually happened, so a healthy server does
  // not pull firewall rules it has no use for.
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
  const rulesQuery = useFirewallRules(client ?? null, timedOut && serverId ? serverId : null)
  const verdict = explainUnreachablePort(timedOut ? rulesQuery.data : undefined, port)

  if (!supported || !ip) return null

  const runTrace = async (): Promise<void> => {
    setTracing(true)
    try {
      setHops((await api!.traceroute!(ip, 12)) ?? [])
    } finally {
      setTracing(false)
    }
  }

  const pill = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {busy && (
          <span className={`${pill} bg-[#e9ecef] dark:bg-[#343a40] text-[#6c757d] dark:text-slate-400`}>
            <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
            Checking port {port}…
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
          <button
            type="button"
            onClick={() => void probe()}
            className="text-[11px] text-[#017cb6] hover:underline"
          >
            Re-check
          </button>
        )}
      </div>

      {/*
        * A timeout is the only case a firewall rule can explain, and even then
        * only if a rule actually covers the port. Saying "check your firewall
        * rules" when none do would send the reader hunting for something that
        * does not exist, while the real cause sits in the guest or the path.
        */}
      {!busy && result && !result.ok && result.error === 'timeout' && (
        <div className="text-[11px] text-[#6c757d] dark:text-slate-400 space-y-1">
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
              No BinaryLane firewall rules are set for this server, so nothing is filtered at their end. The drop is
              the server&apos;s own firewall or the path in between.
            </span>
          )}

          {verdict.kind === 'no-matching-rule' && (
            <span>
              No BinaryLane rule blocks port {port}, so check the server&apos;s own firewall — ufw or nftables on
              Linux, Windows Defender Firewall on Windows.
            </span>
          )}

          {verdict.kind === 'unknown' && (
            <span>Port {port} did not answer from this network. Nothing was refused, which is what a drop looks like.</span>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void runTrace()}
              disabled={tracing}
              className="inline-flex items-center gap-1 text-[#017cb6] hover:underline disabled:opacity-50"
            >
              {tracing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Route className="w-3 h-3" />}
              <span>{tracing ? 'Tracing…' : 'Trace route'}</span>
            </button>
          </div>
        </div>
      )}

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
        <p className="text-[11px] text-[#6c757d] dark:text-slate-400">
          Traceroute returned nothing — the system tool may be unavailable here.
        </p>
      )}
    </div>
  )
}
