import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Play,
  RotateCw,
  Power,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Radio,
  Key,
  Copy,
  Check,
  Globe,
  Network,
  Shield,
  Layers,
  Settings,
  Lock,
  AlertTriangle
} from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import { LocalSshKey } from '@shared/ipc-types'
import { FirewallManager } from '../firewall/FirewallManager'
import { BackupManager } from '../backups/BackupManager'
import { ServerNetwork } from './ServerNetwork'
import {
  useServerMetrics,
  useServerConsole,
  useServerActionMutation
} from '../../api/queries'
import { logoForDistribution } from '../../lib/distroHelper'
import { ServerSubTab } from '../layout/Sidebar'

type ServerResponse = components['schemas']['Server']

interface ServerDetailsProps {
  server: ServerResponse
  client: BinaryLaneClient | null
  activeSubTab?: ServerSubTab
  onBack: () => void
  onOpenTerminal?: (ip: string) => void
}

export const ServerDetails: React.FC<ServerDetailsProps> = ({
  server,
  client,
  activeSubTab = 'overview',
  onBack
}) => {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)
  const [localKeys, setLocalKeys] = useState<LocalSshKey[]>([])
  const [selectedKeyPath, setSelectedKeyPath] = useState<string>('')

  useEffect(() => {
    if (window.bldeskApi?.getLocalSshKeys) {
      window.bldeskApi
        .getLocalSshKeys()
        .then((keys) => {
          if (Array.isArray(keys)) {
            setLocalKeys(keys)
            const defaultKey = keys.find((k) => k.privateKeyPath)
            if (defaultKey?.privateKeyPath) {
              setSelectedKeyPath(defaultKey.privateKeyPath)
            }
          }
        })
        .catch(console.error)
    }
  }, [])

  const metricsQuery = useServerMetrics(client, server.id)
  const consoleQuery = useServerConsole(client, server.id)
  const serverAction = useServerActionMutation(client)

  const primaryV4 =
    server.networks?.v4?.find((v) => v.type === 'public')?.ip_address ||
    server.networks?.v4?.[0]?.ip_address ||
    '127.0.0.1'

  const primaryV6 = server.networks?.v6?.[0]?.ip_address
  const isRunning = server.status === 'active'
  const distroIcon = logoForDistribution(server.image?.distribution)
  const ramGB = (server.memory / 1024).toFixed(0)

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
      window.bldeskApi?.sendNotification?.({
        title: `Server Action: ${actionType}`,
        body: `Action initiated successfully.`
      })
      if (actionType === 'ping' || actionType === 'uptime' || actionType === 'is_running') {
        setDiagnosticResult(`Result of ${actionType}: ${JSON.stringify((res as any)?.result || res?.status || 'Success')}`)
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
    window.bldeskApi?.openRescueConsole?.({
      serverId: server.id,
      serverName: server.name,
      url,
      width: consoleQuery.data.width || 1024,
      height: consoleQuery.data.height || 768
    })
  }

  const sample = metricsQuery.data?.average

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa] overflow-y-auto select-text">
      {/* 1. Authentic PanelSite ServerHeader */}
      <div className="p-4 bg-white dark:bg-[#2b3035] border-b border-[#ced4da] dark:border-[#373b3e] shadow-sm sticky top-0 z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="md:hidden text-xs text-[#017cb6] hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Servers</span>
              </button>
              <h1 className="text-lg font-bold text-[#212529] dark:text-white flex items-center gap-2">
                <img src={distroIcon} alt="" className="w-5 h-5 object-contain" />
                <span><span className="text-[#6c757d] dark:text-slate-400 font-normal">Server:</span> {server.name}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    isRunning
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </h1>
            </div>

            {/* Breadcrumb Specs */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6c757d] dark:text-slate-400 mt-1">
              <span className="font-mono text-[#212529] dark:text-slate-200">{primaryV4}</span>
              <span>•</span>
              <span>{server.region?.name || server.region?.slug?.toUpperCase()}</span>
              <span>•</span>
              <span>{server.vcpus} vCPUs / {ramGB} GB RAM / {server.disk} GB Disk</span>
              <span>•</span>
              <span>{server.image?.full_name || server.image?.name}</span>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* SSH Key Selector */}
            <div className="flex items-center gap-1 bg-[#f8f9fa] dark:bg-[#212529] px-2 py-1 border border-[#ced4da] dark:border-[#373b3e] rounded">
              <Key className="w-3.5 h-3.5 text-[#f1ca00] flex-shrink-0" />
              <select
                value={selectedKeyPath}
                onChange={(e) => setSelectedKeyPath(e.target.value)}
                className="bg-transparent text-xs text-[#212529] dark:text-slate-200 focus:outline-none cursor-pointer max-w-[120px]"
              >
                <option value="">Default Key</option>
                {localKeys.map((k) => (
                  <option key={k.name} value={k.privateKeyPath || ''} className="bg-white dark:bg-[#2b3035]">
                    {k.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() =>
                window.bldeskApi?.launchNativeTerminal?.({
                  host: primaryV4,
                  username: 'root',
                  privateKeyPath: selectedKeyPath || undefined
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#017cb6] hover:bg-[#016594] rounded transition shadow-sm"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Launch SSH</span>
            </button>

            <button
              onClick={handleLaunchRescueConsole}
              disabled={!consoleQuery.data}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded transition disabled:opacity-50"
              title="Open Out-of-Band Rescue VNC / Serial Console"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Console</span>
            </button>

            {isRunning ? (
              <>
                <button
                  onClick={() => handleAction('reboot')}
                  disabled={!!actionInProgress}
                  className="p-1.5 text-[#6c757d] hover:text-amber-500 hover:bg-[#e9ecef] dark:hover:bg-[#343a40] rounded transition border border-[#ced4da] dark:border-[#373b3e]"
                  title="Reboot"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAction('shutdown')}
                  disabled={!!actionInProgress}
                  className="p-1.5 text-[#6c757d] hover:text-rose-500 hover:bg-[#e9ecef] dark:hover:bg-[#343a40] rounded transition border border-[#ced4da] dark:border-[#373b3e]"
                  title="Graceful Shutdown"
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => handleAction('power_on')}
                disabled={!!actionInProgress}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded transition hover:bg-emerald-100"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Power On</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {diagnosticResult && (
        <div className="mx-6 mt-4 p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs rounded flex items-center justify-between">
          <span>{diagnosticResult}</span>
          <button onClick={() => setDiagnosticResult(null)} className="text-[#017cb6] hover:underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SubTab Viewport */}
      <div className="p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6">
            {/* Real-time Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>CPU Usage</span>
                  <Cpu className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">
                    {sample ? `${sample.cpu_usage_percent.toFixed(1)}%` : '—'}
                  </span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">{server.vcpus} vCPU</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Memory</span>
                  <Activity className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">
                    {sample && server.memory > 0
                      ? `${((sample.memory_usage_bytes / (server.memory * 1024 * 1024)) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">{ramGB} GB allocated</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Disk Storage</span>
                  <HardDrive className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">{server.disk} GB</span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">NVMe High IOPS</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Network Status</span>
                  <Globe className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Online</span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">1 Gbps Uplink</span>
                </div>
              </div>
            </div>

            {/* Server Information & Network DefTable Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* DefTable 1: Server Info */}
              <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] font-semibold text-xs text-[#495057] dark:text-[#ced4da]">
                  Server Information
                </div>
                <div className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e] text-xs">
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Server ID</span>
                    <span className="font-mono text-[#212529] dark:text-white font-medium">#{server.id}</span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Hostname</span>
                    <span className="text-[#212529] dark:text-white font-medium">{server.name}</span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Data Centre</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.region?.name} ({server.region?.slug?.toUpperCase()})
                    </span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Operating System</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.image?.full_name || server.image?.name}
                    </span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Created At</span>
                    <span className="text-[#212529] dark:text-white">
                      {server.created_at ? new Date(server.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* DefTable 2: Network & Addressing */}
              <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] font-semibold text-xs text-[#495057] dark:text-[#ced4da]">
                  Network & Addressing
                </div>
                <div className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e] text-xs">
                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Public IPv4</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#212529] dark:text-white font-medium">{primaryV4}</span>
                      <button
                        onClick={() => handleCopy(primaryV4)}
                        className="text-[#6c757d] hover:text-[#017cb6]"
                      >
                        {copiedText === primaryV4 ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {primaryV6 && (
                    <div className="flex items-center justify-between py-2.5 px-4">
                      <span className="w-32 text-[#6c757d] dark:text-slate-400">Public IPv6</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#212529] dark:text-white truncate max-w-[200px]">
                          {primaryV6}
                        </span>
                        <button
                          onClick={() => handleCopy(primaryV6)}
                          className="text-[#6c757d] hover:text-[#017cb6]"
                        >
                          {copiedText === primaryV6 ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">VPC Network</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.vpc_id ? `Attached (VPC #${server.vpc_id})` : 'Default Public Bridge'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">SSH Connect</span>
                    <button
                      onClick={() => handleCopy(`ssh root@${primaryV4}`)}
                      className="flex items-center gap-1.5 text-xs text-[#017cb6] hover:underline font-mono"
                    >
                      <span>ssh root@{primaryV4}</span>
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* USAGE & METRICS TAB */}
        {activeSubTab === 'usage' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
              <h3 className="text-sm font-bold text-[#212529] dark:text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#017cb6]" />
                <span>Live CPU Utilization Breakdown</span>
              </h3>
              {sample?.cpu_usage_detailed && sample.cpu_usage_detailed.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {sample.cpu_usage_detailed.map((coreUsage: number, i: number) => (
                    <div
                      key={i}
                      className="bg-[#f8f9fa] dark:bg-[#212529] p-3 rounded border border-[#ced4da] dark:border-[#373b3e]"
                    >
                      <div className="flex justify-between text-xs text-[#6c757d] mb-1">
                        <span>vCPU #{i}</span>
                        <span className="font-semibold text-[#212529] dark:text-white">
                          {(coreUsage * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-[#ced4da] dark:bg-[#343a40] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#017cb6] h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, coreUsage * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#6c757d] dark:text-slate-400 py-6 text-center">
                  Live CPU metrics stream initializing...
                </div>
              )}
            </div>
          </div>
        )}

        {/* REMOTE ACCESS TAB */}
        {activeSubTab === 'remote-access' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
              <h3 className="text-sm font-bold text-[#212529] dark:text-white mb-2">Native Terminal & SSH Keys</h3>
              <p className="text-xs text-[#6c757d] dark:text-slate-400 mb-4">
                Launch an instant SSH connection in your macOS/Windows terminal using your hardware-vault keys.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    window.bldeskApi?.launchNativeTerminal?.({
                      host: primaryV4,
                      username: 'root',
                      privateKeyPath: selectedKeyPath || undefined
                    })
                  }
                  className="px-4 py-2 bg-[#017cb6] hover:bg-[#016594] text-white text-xs font-medium rounded transition flex items-center gap-2 shadow-sm"
                >
                  <Terminal className="w-4 h-4" />
                  <span>Launch Terminal Now</span>
                </button>
                <button
                  onClick={handleLaunchRescueConsole}
                  disabled={!consoleQuery.data}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Radio className="w-4 h-4" />
                  <span>Open Out-of-Band Rescue VNC</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NETWORK TAB */}
        {activeSubTab === 'network' && (
          <div className="space-y-4">
            {/* IPv4 Networking Card */}
            <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden flex-shrink-0">
              <div className="p-3.5 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
                <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#017cb6]" />
                  <span>IPv4 Addresses & Routing ({server.networks?.v4?.length || 0})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#f8f9fa] dark:bg-[#212529] border-b border-[#ced4da] dark:border-[#373b3e] text-[#6c757d] dark:text-slate-400 font-semibold">
                      <th className="py-2 px-4">IP Address</th>
                      <th className="py-2 px-4">Type</th>
                      <th className="py-2 px-4">Netmask</th>
                      <th className="py-2 px-4">Gateway</th>
                      <th className="py-2 px-4">Reverse DNS (PTR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
                    {(server.networks?.v4 || []).map((net, idx) => (
                      <tr key={idx} className="hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#017cb6]">
                          <div className="flex items-center gap-1.5">
                            <span>{net.ip_address}</span>
                            <button
                              onClick={() => handleCopy(net.ip_address)}
                              className="text-[#6c757d] hover:text-[#017cb6] p-1 rounded transition"
                              title="Copy IP"
                            >
                              {copiedText === net.ip_address ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              net.type === 'public'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                            }`}
                          >
                            {net.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#6c757d] dark:text-slate-400">
                          {net.netmask || '255.255.255.0'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#6c757d] dark:text-slate-400">
                          {net.gateway || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-[#212529] dark:text-slate-200">
                          {net.reverse_name || <span className="text-[#6c757d] dark:text-slate-500 italic">None configured</span>}
                        </td>
                      </tr>
                    ))}
                    {(!server.networks?.v4 || server.networks.v4.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-4 px-4 text-center text-[#6c757d] dark:text-slate-400">
                          No IPv4 addresses assigned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* IPv6 Networking Card */}
            <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden flex-shrink-0">
              <div className="p-3.5 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
                <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#017cb6]" />
                  <span>IPv6 Addresses ({server.networks?.v6?.length || 0})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#f8f9fa] dark:bg-[#212529] border-b border-[#ced4da] dark:border-[#373b3e] text-[#6c757d] dark:text-slate-400 font-semibold">
                      <th className="py-2 px-4">IPv6 Address</th>
                      <th className="py-2 px-4">Netmask</th>
                      <th className="py-2 px-4">Gateway</th>
                      <th className="py-2 px-4">Reverse DNS (PTR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
                    {(server.networks?.v6 || []).map((net, idx) => (
                      <tr key={idx} className="hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#017cb6]">
                          <div className="flex items-center gap-1.5">
                            <span>{net.ip_address}</span>
                            <button
                              onClick={() => handleCopy(net.ip_address)}
                              className="text-[#6c757d] hover:text-[#017cb6] p-1 rounded transition"
                              title="Copy IPv6"
                            >
                              {copiedText === net.ip_address ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#6c757d] dark:text-slate-400">
                          {net.netmask || '/64'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#6c757d] dark:text-slate-400">
                          {net.gateway || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-[#212529] dark:text-slate-200">
                          {net.reverse_name || <span className="text-[#6c757d] dark:text-slate-500 italic">None configured</span>}
                        </td>
                      </tr>
                    ))}
                    {(!server.networks?.v6 || server.networks.v6.length === 0) && (
                      <tr>
                        <td colSpan={4} className="py-4 px-4 text-center text-[#6c757d] dark:text-slate-400">
                          No IPv6 addresses assigned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hardware & Interface Properties */}
            <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] p-5 shadow-sm space-y-3 flex-shrink-0">
              <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
                <Network className="w-4 h-4 text-[#017cb6]" />
                <span>Interface & Security Properties</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 text-xs">
                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">Primary MAC Address</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono font-medium text-[#212529] dark:text-white">
                      {server.networks?.mac_address || '—'}
                    </span>
                    {server.networks?.mac_address && (
                      <button
                        onClick={() => handleCopy(server.networks.mac_address)}
                        className="text-[#6c757d] hover:text-[#017cb6] p-1 rounded transition"
                      >
                        {copiedText === server.networks.mac_address ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">VPC Assignment</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Layers className="w-3.5 h-3.5 text-[#017cb6]" />
                    <span className="font-medium text-[#212529] dark:text-white">
                      {server.vpc_id ? `VPC #${server.vpc_id}` : 'Default Public Network'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">DDoS Protection Status</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Shield className={`w-3.5 h-3.5 ${server.networks?.recent_ddos ? 'text-amber-500' : 'text-emerald-500'}`} />
                    <span className="font-medium text-[#212529] dark:text-white">
                      {server.networks?.recent_ddos ? 'Under Attack / Mitigation' : 'Active & Protected'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">Port Blocking</span>
                  <span className="font-medium text-[#212529] dark:text-white mt-1 block">
                    {server.networks?.port_blocking ? 'Enabled (Standard outbound SMTP/NetBIOS filtered)' : 'Disabled'}
                  </span>
                </div>

                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">Source & Destination Check</span>
                  <span className="font-medium text-[#212529] dark:text-white mt-1 block">
                    {server.networks?.source_and_destination_check ? 'Enabled' : 'Disabled (Routing enabled)'}
                  </span>
                </div>

                <div className="p-3 bg-[#f8f9fa] dark:bg-[#212529] rounded border border-[#ced4da] dark:border-[#373b3e]">
                  <span className="text-[#6c757d] dark:text-slate-400 block text-[11px]">Failover IP Addresses</span>
                  <span className="font-medium text-[#212529] dark:text-white mt-1 block">
                    {server.failover_ips?.length ? server.failover_ips.join(', ') : 'None assigned'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BACKUPS TAB */}
        {activeSubTab === 'backups' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
            <BackupManager client={client} initialServerId={server.id} />
          </div>
        )}

        {/* NETWORK TAB */}
        {activeSubTab === 'network' && <ServerNetwork client={client} server={server} />}

        {/* FIREWALL TAB */}
        {activeSubTab === 'firewall' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
            <FirewallManager client={client} initialServerId={server.id} />
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeSubTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] p-5 shadow-sm space-y-4 flex-shrink-0">
              <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#017cb6]" />
                <span>Server Plan & Configuration</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-[#6c757d] dark:text-slate-400 block text-[11px] mb-1">Hostname / Label</label>
                  <input
                    type="text"
                    disabled
                    value={server.name}
                    className="w-full px-3 py-2 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded font-medium text-[#212529] dark:text-white text-xs opacity-80 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[#6c757d] dark:text-slate-400 block text-[11px] mb-1">Hardware Plan</label>
                  <input
                    type="text"
                    disabled
                    value={`${server.vcpus} vCPU · ${ramGB} GB RAM · ${server.disk} GB Disk`}
                    className="w-full px-3 py-2 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded font-medium text-[#212529] dark:text-white text-xs opacity-80 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Password & Security Actions */}
            <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] p-5 shadow-sm space-y-3 flex-shrink-0">
              <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#017cb6]" />
                <span>Security & Administrative Operations</span>
              </h3>
              <p className="text-xs text-[#6c757d] dark:text-slate-400">
                Trigger root/admin password resets or hardware sync operations.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => handleAction('password_reset')}
                  disabled={!!actionInProgress}
                  className="px-3.5 py-2 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] hover:border-[#017cb6] text-xs font-medium rounded transition flex items-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5 text-[#017cb6]" />
                  <span>Reset Root / Admin Password</span>
                </button>
                <button
                  onClick={() => handleAction('power_cycle')}
                  disabled={!!actionInProgress}
                  className="px-3.5 py-2 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] hover:border-[#017cb6] text-xs font-medium rounded transition flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5 text-[#017cb6]" />
                  <span>Hard Power Cycle</span>
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg p-5 space-y-3 flex-shrink-0">
              <h3 className="font-bold text-xs text-rose-800 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Danger Zone</span>
              </h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
                Destructive actions will cause server downtime or irreversible data loss. Proceed with extreme caution.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => handleAction('rebuild')}
                  disabled={!!actionInProgress}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded transition flex items-center gap-1.5 shadow-sm"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rebuild Operating System</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECOVERY TAB */}
        {activeSubTab === 'recovery' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#212529] dark:text-white">Emergency Recovery & Rescue</h3>
            <p className="text-xs text-[#6c757d] dark:text-slate-400">
              Run hypervisor hardware diagnostics or reboot into safe rescue mode.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => handleAction('ping')}
                disabled={!!actionInProgress}
                className="px-3 py-1.5 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] hover:border-[#017cb6] text-xs font-medium rounded transition"
              >
                Hypervisor Ping Check
              </button>
              <button
                onClick={() => handleAction('uptime')}
                disabled={!!actionInProgress}
                className="px-3 py-1.5 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] hover:border-[#017cb6] text-xs font-medium rounded transition"
              >
                Host Node Uptime
              </button>
              <button
                onClick={() => handleAction('enable_rescue_mode')}
                disabled={!!actionInProgress}
                className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 text-xs font-medium rounded hover:bg-amber-500/20 transition"
              >
                Boot into Rescue Mode
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
