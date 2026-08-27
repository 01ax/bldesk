import React, { useState } from 'react'
import {
  ArrowLeft,
  Server,
  Play,
  RotateCw,
  Power,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Network,
  Shield,
  Archive,
  Radio,
  Key,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import {
  useServerMetrics,
  useServerConsole,
  useServerActionMutation,
  useServerBackups,
  useServerSnapshots,
  useFirewallRules
} from '../../api/queries'

type ServerResponse = components['schemas']['Server']

interface ServerDetailsProps {
  server: ServerResponse
  client: BinaryLaneClient | null
  onBack: () => void
  onOpenTerminal: (ip: string) => void
}

export const ServerDetails: React.FC<ServerDetailsProps> = ({
  server,
  client,
  onBack,
  onOpenTerminal
}) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'network' | 'backups' | 'firewall'>('metrics')
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)

  const metricsQuery = useServerMetrics(client, server.id)
  const consoleQuery = useServerConsole(client, server.id)
  const backupsQuery = useServerBackups(client, server.id)
  const snapshotsQuery = useServerSnapshots(client, server.id)
  const firewallQuery = useFirewallRules(client, server.id)
  const serverAction = useServerActionMutation(client)

  const primaryV4 =
    server.networks?.v4?.find((v) => v.type === 'public')?.ip_address ||
    server.networks?.v4?.[0]?.ip_address ||
    '127.0.0.1'

  const isRunning = server.status === 'active'

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1500)
  }

  const handleAction = async (actionType: string, customPayload: any = {}) => {
    if (!confirm(`Trigger action "${actionType}" on server #${server.id}?`)) return
    setActionInProgress(actionType)
    try {
      const res = await serverAction.mutateAsync({
        serverId: server.id,
        actionPayload: { type: actionType, ...customPayload }
      })
      window.bldeskApi.sendNotification({
        title: `Server Action: ${actionType}`,
        body: `Action #${res?.id || ''} initiated successfully.`
      })
      if (actionType === 'ping' || actionType === 'uptime' || actionType === 'is_running') {
        setDiagnosticResult(`Result of ${actionType}: ${JSON.stringify(res?.result || res?.status || 'Success')}`)
      }
    } catch (err: any) {
      alert(`Action failed: ${err.message || 'Unknown error'}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleLaunchRescueConsole = () => {
    if (!consoleQuery.data) return
    const url = consoleQuery.data.browser || consoleQuery.data.iframe
    window.bldeskApi.openRescueConsole({
      serverId: server.id,
      serverName: server.name,
      url,
      width: consoleQuery.data.width || 1024,
      height: consoleQuery.data.height || 768
    })
  }

  const sample = metricsQuery.data?.average

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto select-text">
      {/* Top Bar Navigation */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Fleet</span>
          </button>
          <div className="border-l border-slate-800 pl-3 flex items-center gap-2">
            <h2 className="text-base font-bold text-white">{server.name}</h2>
            <span className="text-xs text-slate-500 font-mono">#{server.id}</span>
            <span
              className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full ${
                isRunning
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
              {isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.bldeskApi.launchNativeTerminal({ host: primaryV4, username: 'root' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Launch SSH</span>
          </button>

          <button
            onClick={handleLaunchRescueConsole}
            disabled={!consoleQuery.data}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg transition disabled:opacity-50"
            title="Open Out-of-Band Rescue VNC / Serial Console"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Rescue Console</span>
          </button>

          {isRunning ? (
            <>
              <button
                onClick={() => handleAction('reboot')}
                disabled={!!actionInProgress}
                className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition"
                title="Reboot"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAction('shutdown')}
                disabled={!!actionInProgress}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                title="Graceful Shutdown"
              >
                <Power className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => handleAction('power_on')}
              disabled={!!actionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950 border border-emerald-800 rounded-lg hover:bg-emerald-900 transition"
            >
              <Play className="w-3.5 h-3.5 fill-emerald-300" />
              <span>Power On</span>
            </button>
          )}
        </div>
      </div>

      {diagnosticResult && (
        <div className="mx-6 mt-4 p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-sky-300 text-xs flex items-center justify-between">
          <span>{diagnosticResult}</span>
          <button onClick={() => setDiagnosticResult(null)} className="text-sky-400 hover:text-white text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 pt-4 border-b border-slate-800 flex items-center gap-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'metrics' ? 'border-sky-500 text-sky-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Real-time Metrics & Gauges</span>
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'network' ? 'border-sky-500 text-sky-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Networking & IPs</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'backups' ? 'border-sky-500 text-sky-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Backups & Snapshots</span>
        </button>

        <button
          onClick={() => setActiveTab('firewall')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'firewall' ? 'border-sky-500 text-sky-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Firewall Rules</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6 flex-1">
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* 4 Live Gauges Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CPU Gauge */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-sky-400" />
                    <span>CPU Utilization</span>
                  </div>
                  <span className="font-mono text-white font-semibold">
                    {sample ? `${sample.cpu_usage_percent.toFixed(1)}%` : '0%'}
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, sample?.cpu_usage_percent || 0)}%` }}
                  ></div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {server.vcpus || server.size?.vcpus || 1} Virtual CPU Cores
                </div>
              </div>

              {/* Memory Gauge */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span>Memory Usage</span>
                  </div>
                  <span className="font-mono text-white font-semibold">
                    {sample
                      ? `${Math.round(sample.memory_usage_bytes / (1024 * 1024))} MB`
                      : '0 MB'}
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        sample ? (sample.memory_usage_bytes / (1024 * 1024 * (server.memory || 1024))) * 100 : 0
                      )}%`
                    }}
                  ></div>
                </div>
                <div className="text-[11px] text-slate-500">
                  Max Peak: {metricsQuery.data?.maximum_memory_megabytes || 0} MB
                </div>
              </div>

              {/* Storage IOPS Gauge */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-400" />
                    <span>Storage IOPS</span>
                  </div>
                  <span className="font-mono text-white font-semibold">
                    {sample
                      ? Math.round((sample.storage_read_requests_per_second || 0) + (sample.storage_write_requests_per_second || 0))
                      : 0}{' '}
                    IOPS
                  </span>
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Read Throughput:</span>
                    <span>{sample ? Math.round(sample.storage_read_kbps) : 0} KB/s</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Write Throughput:</span>
                    <span>{sample ? Math.round(sample.storage_write_kbps) : 0} KB/s</span>
                  </div>
                </div>
              </div>

              {/* Network Throughput */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <span>Network Bandwidth</span>
                  </div>
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Inbound:</span>
                    <span className="text-emerald-400 font-mono">
                      {sample ? `${(sample.network_incoming_kbps / 1024).toFixed(2)} MB/s` : '0 MB/s'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Outbound:</span>
                    <span className="text-sky-400 font-mono">
                      {sample ? `${(sample.network_outgoing_kbps / 1024).toFixed(2)} MB/s` : '0 MB/s'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Diagnostic Actions */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Instant Server Diagnostics & Actions
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleAction('ping')}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                >
                  Ping Server
                </button>
                <button
                  onClick={() => handleAction('uptime')}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                >
                  Check Uptime
                </button>
                <button
                  onClick={() => handleAction('is_running')}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                >
                  Verify Running State
                </button>
                <button
                  onClick={() => handleAction('take_backup')}
                  className="px-3 py-1.5 text-xs bg-purple-950/60 border border-purple-800/60 hover:bg-purple-900 text-purple-300 rounded-lg transition"
                >
                  Take Manual Snapshot
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Network Interfaces & IP Addresses</h3>
            <div className="space-y-2">
              {(server.networks?.v4 || []).map((net, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs"
                >
                  <div>
                    <div className="font-mono text-white font-medium flex items-center gap-2">
                      <span>{net.ip_address}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-sans">
                        {net.type}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Netmask: {net.netmask} • Gateway: {net.gateway}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(net.ip_address)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                    title="Copy IP"
                  >
                    {copiedText === net.ip_address ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'backups' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Snapshots & Backups</h3>
              <button
                onClick={() => handleAction('take_backup')}
                className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition"
              >
                Create Snapshot Now
              </button>
            </div>
            {snapshotsQuery.isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            ) : (
              <div className="space-y-2">
                {((snapshotsQuery.data as any[]) || []).length === 0 && (
                  <div className="text-xs text-slate-500 p-6 bg-slate-900/30 rounded-xl text-center">
                    No snapshots taken yet for this server.
                  </div>
                )}
                {((snapshotsQuery.data as any[]) || []).map((snap: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{snap.name || `Snapshot #${snap.id}`}</div>
                      <div className="text-[11px] text-slate-500">{snap.created_at || 'Point-in-time'}</div>
                    </div>
                    <button
                      onClick={() => handleAction('restore', { image_id: snap.id })}
                      className="px-2.5 py-1 text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded-lg hover:bg-amber-900 transition"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'firewall' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Advanced Firewall Rules</h3>
            <div className="space-y-2">
              {((firewallQuery.data as any[]) || []).length === 0 && (
                <div className="text-xs text-slate-500 p-6 bg-slate-900/30 rounded-xl text-center">
                  Default firewall policy active (all inbound ports open).
                </div>
              )}
              {((firewallQuery.data as any[]) || []).map((rule: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${rule.action === 'accept' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                      {rule.action}
                    </span>
                    <span className="text-white font-mono">{rule.protocol?.toUpperCase()}</span>
                    <span className="text-slate-400">Port {rule.destination_ports || 'Any'}</span>
                  </div>
                  <span className="text-slate-500 text-[11px]">{rule.source_addresses || '0.0.0.0/0'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
