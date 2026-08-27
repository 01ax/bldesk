import React, { useState } from 'react'
import {
  Server as ServerIcon,
  Play,
  RotateCw,
  Power,
  Terminal,
  Search,
  Copy,
  Check,
  Cpu,
  HardDrive,
  Activity,
  Loader2,
  Plus
} from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import { useServerActionMutation } from '../../api/queries'
import { CreateServerModal } from './CreateServerModal'

type ServerResponse = components['schemas']['Server']

interface ServerListProps {
  servers: ServerResponse[]
  isLoading: boolean
  client: BinaryLaneClient | null
  onSelectServer: (server: ServerResponse) => void
  onOpenTerminal: (ip: string) => void
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  isLoading,
  client,
  onSelectServer,
  onOpenTerminal
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [copiedIp, setCopiedIp] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const serverAction = useServerActionMutation(client)

  const handleCopyIp = (ip: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const handleAction = async (serverId: number, actionType: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to perform "${actionType}" on server #${serverId}?`)) return

    try {
      await serverAction.mutateAsync({
        serverId,
        actionPayload: { type: actionType }
      })
      window.bldeskApi.sendNotification({
        title: `Server Action: ${actionType}`,
        body: `Action requested successfully for server #${serverId}.`
      })
    } catch (err: any) {
      alert(`Action failed: ${err.message || 'Unknown error'}`)
    }
  }

  const handleLaunchNativeSsh = (ip: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.bldeskApi.launchNativeTerminal({ host: ip, username: 'root' })
  }

  const filteredServers = servers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.networks?.v4 || []).some((net) => net.ip_address.includes(searchTerm)) ||
      (((s as any).tags || []) as string[]).some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesRegion = regionFilter === 'all' || s.region?.slug === regionFilter
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter

    return matchesSearch && matchesRegion && matchesStatus
  })

  // Unique regions
  const availableRegions = Array.from(new Set(servers.map((s) => s.region?.slug).filter(Boolean)))

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <ServerIcon className="w-5 h-5 text-sky-400" />
            <span>Virtual Servers</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
              {servers.length} total
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">High-performance cloud compute instances across Australia & Asia</p>
        </div>

        {/* Search & Filter bar & Deploy Button */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, IP, tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition w-48"
            />
          </div>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Regions</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg!}>
                {reg?.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="off">Powered Off</option>
            <option value="archive">Archived</option>
          </select>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow-md shadow-sky-950/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Deploy Instance</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-xs">Synchronizing fleet status...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredServers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3 bg-slate-900/30 rounded-2xl border border-slate-800/60">
          <ServerIcon className="w-10 h-10 text-slate-600" />
          <div className="text-center">
            <h3 className="text-sm font-semibold text-slate-300">No servers found</h3>
            <p className="text-xs text-slate-500 mt-1">
              {servers.length === 0 ? 'No instances provisioned in this account.' : 'Try adjusting your search filters.'}
            </p>
          </div>
        </div>
      )}

      {/* Servers Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredServers.map((server) => {
          const primaryV4 = server.networks?.v4?.find((v) => v.type === 'public')?.ip_address || server.networks?.v4?.[0]?.ip_address || 'No IPv4'
          const isRunning = server.status === 'active'

          return (
            <div
              key={server.id}
              onClick={() => onSelectServer(server)}
              className="group bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-sky-500/40 rounded-xl p-4 transition duration-150 cursor-pointer shadow-lg hover:shadow-sky-950/20 flex flex-col justify-between space-y-4"
            >
              {/* Top Row: Name, Status & Region */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white group-hover:text-sky-300 transition">
                      {server.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">#{server.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-slate-300 flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {primaryV4}
                      <button
                        onClick={(e) => handleCopyIp(primaryV4, e)}
                        className="text-slate-500 hover:text-slate-300 p-0.5"
                        title="Copy IP"
                      >
                        {copiedIp === primaryV4 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </span>
                    <span>•</span>
                    <span className="text-[11px] text-slate-400 uppercase font-medium">
                      {server.image?.distribution} {server.image?.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {server.region?.slug?.toUpperCase()}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full ${
                      isRunning
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                    {isRunning ? 'Running' : 'Stopped'}
                  </span>
                </div>
              </div>

              {/* Middle Row: Specs Chips */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                  <Cpu className="w-3.5 h-3.5 text-sky-400" />
                  <div>
                    <div className="text-[10px] text-slate-500 font-medium">vCPU</div>
                    <div className="text-slate-200 font-semibold">{server.vcpus || server.size?.vcpus || 1} Cores</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  <div>
                    <div className="text-[10px] text-slate-500 font-medium">Memory</div>
                    <div className="text-slate-200 font-semibold">{Math.round((server.memory || server.size?.memory || 1024) / 1024)} GB</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                  <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                  <div>
                    <div className="text-[10px] text-slate-500 font-medium">Storage</div>
                    <div className="text-slate-200 font-semibold">{server.disk || server.size?.disk || 20} GB</div>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Quick Action Toolbar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  {/* Terminal Launcher Buttons */}
                  <button
                    onClick={(e) => handleLaunchNativeSsh(primaryV4, e)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition"
                    title="Launch in Native OS Terminal (Windows Terminal / iTerm2)"
                  >
                    <Terminal className="w-3 h-3 text-sky-400" />
                    <span>SSH Terminal</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenTerminal(primaryV4)
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md transition"
                    title="Open Inline Embedded Terminal"
                  >
                    <span>Inline</span>
                  </button>
                </div>

                {/* Power Control Buttons */}
                <div className="flex items-center gap-1">
                  {isRunning ? (
                    <>
                      <button
                        onClick={(e) => handleAction(server.id, 'reboot', e)}
                        className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-md transition"
                        title="Reboot Server"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleAction(server.id, 'shutdown', e)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition"
                        title="Graceful Shutdown"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => handleAction(server.id, 'power_on', e)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-md transition"
                      title="Power On Server"
                    >
                      <Play className="w-3 h-3 fill-emerald-400" />
                      <span>Power On</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Deploy Server Wizard Modal */}
      <CreateServerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        client={client}
      />
    </div>
  )
}
