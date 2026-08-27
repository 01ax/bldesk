import React, { useState } from 'react'
import {
  Layers,
  Plus,
  Server,
  Loader2,
  ArrowRight,
  UserPlus,
  Unlink,
  Trash2,
  X,
  AlertCircle,
  Copy,
  Check,
  Activity,
  ArrowRightLeft
} from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import {
  useLoadBalancers,
  useServers,
  useRegions,
  useAddServerToLoadBalancerMutation,
  useRemoveServerFromLoadBalancerMutation,
  useCreateLoadBalancerMutation,
  useDeleteLoadBalancerMutation
} from '../../api/queries'

type ServerResponse = components['schemas']['Server']

interface LoadBalancerManagerProps {
  client: BinaryLaneClient | null
  onSelectServer?: (server: ServerResponse) => void
}

export const LoadBalancerManager: React.FC<LoadBalancerManagerProps> = ({
  client,
  onSelectServer
}) => {
  const [copiedIp, setCopiedIp] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Create Form State
  const [lbName, setLbName] = useState('')
  const [lbRegion, setLbRegion] = useState('syd')
  const [entryProtocol, setEntryProtocol] = useState<'http' | 'https'>('http')
  const [healthPath, setHealthPath] = useState('/')
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  // Add Server to Pool Modal State
  const [attachModalLb, setAttachModalLb] = useState<any | null>(null)
  const [selectedServerToAttach, setSelectedServerToAttach] = useState<number | null>(null)
  const [actionServerId, setActionServerId] = useState<number | null>(null)

  const lbsQuery = useLoadBalancers(client)
  const serversQuery = useServers(client)
  const regionsQuery = useRegions(client)

  const addServerMutation = useAddServerToLoadBalancerMutation(client)
  const removeServerMutation = useRemoveServerFromLoadBalancerMutation(client)
  const createLbMutation = useCreateLoadBalancerMutation(client)
  const deleteLbMutation = useDeleteLoadBalancerMutation(client)

  const loadBalancers = lbsQuery.data || []
  const servers = serversQuery.data || []
  const regions = regionsQuery.data || []

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedIp(text)
    setTimeout(() => setCopiedIp(null), 1500)
  }

  // Toggle server in create form
  const handleToggleCreateServer = (serverId: number) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    )
  }

  // Create Load Balancer Submit
  const handleCreateLb = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!lbName.trim()) {
      setCreateError('Please enter a valid hostname / name for the load balancer.')
      return
    }

    try {
      await createLbMutation.mutateAsync({
        name: lbName.trim(),
        region: lbRegion === 'anycast' ? undefined : lbRegion,
        forwarding_rules: [
          {
            entry_protocol: entryProtocol
          }
        ],
        server_ids: selectedServerIds.length > 0 ? selectedServerIds : undefined,
        health_check: {
          protocol: entryProtocol,
          path: healthPath.startsWith('/') ? healthPath : `/${healthPath}`
        }
      })

      setIsCreating(false)
      setLbName('')
      setSelectedServerIds([])
      window.bldeskApi.sendNotification({
        title: 'Load Balancer Provisioned',
        body: `Created load balancer "${lbName}".`
      })
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create load balancer.')
    }
  }

  // Add Server to LB Pool
  const handleAttachServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!attachModalLb || !selectedServerToAttach) return

    try {
      await addServerMutation.mutateAsync({
        loadBalancerId: attachModalLb.id,
        serverId: selectedServerToAttach
      })

      const targetServerName =
        servers.find((s) => s.id === selectedServerToAttach)?.name || selectedServerToAttach

      window.bldeskApi.sendNotification({
        title: 'Server Added to Pool',
        body: `Attached "${targetServerName}" to load balancer "${attachModalLb.name}".`
      })

      setAttachModalLb(null)
      setSelectedServerToAttach(null)
    } catch (err: any) {
      alert(`Failed to add server to pool: ${err.message}`)
    }
  }

  // Remove Server from LB Pool
  const handleRemoveServer = async (lb: any, server: ServerResponse) => {
    const confirmed = confirm(
      `Remove server "${server.name}" from load balancer "${lb.name}"?\n\nTraffic will no longer be routed to this instance.`
    )
    if (!confirmed) return

    setActionServerId(server.id)
    try {
      await removeServerMutation.mutateAsync({
        loadBalancerId: lb.id,
        serverId: server.id
      })

      window.bldeskApi.sendNotification({
        title: 'Server Removed from Pool',
        body: `Removed "${server.name}" from load balancer "${lb.name}".`
      })
    } catch (err: any) {
      alert(`Failed to remove server: ${err.message}`)
    } finally {
      setActionServerId(null)
    }
  }

  // Delete Load Balancer
  const handleDeleteLb = async (lbId: number, name: string) => {
    const confirmed = confirm(
      `Are you sure you want to permanently delete load balancer "${name}"?\n\nIts IP address and routing will be released.`
    )
    if (!confirmed) return

    try {
      await deleteLbMutation.mutateAsync(lbId)
      window.bldeskApi.sendNotification({
        title: 'Load Balancer Deleted',
        body: `Load balancer "${name}" was deleted.`
      })
    } catch (err: any) {
      alert(`Failed to delete load balancer: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-sky-400" />
            <span>Load Balancers & Traffic Routing</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            High-availability traffic distribution, health checking, and automatic failover
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Deploy Load Balancer</span>
        </button>
      </div>

      {/* Deploy Load Balancer Modal / Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateLb}
          className="p-5 bg-slate-900/90 border border-sky-500/40 rounded-2xl space-y-4 text-xs animate-in fade-in shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-bold text-white">Deploy New Load Balancer</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                Hostname / Identifier
              </label>
              <input
                type="text"
                required
                placeholder="e.g. lb-prod-australia"
                value={lbName}
                onChange={(e) => setLbName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Region</label>
              <select
                value={lbRegion}
                onChange={(e) => setLbRegion(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              >
                <option value="anycast">🌍 Global Anycast (Multi-Region Routing)</option>
                {regions.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name} ({r.slug.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Forwarding Rule & Health Check Settings */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300">Routing & Health Check Configuration:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5 font-semibold">Forwarding Protocol</label>
                <select
                  value={entryProtocol}
                  onChange={(e) => setEntryProtocol(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white uppercase font-mono"
                >
                  <option value="http">HTTP (Port 80)</option>
                  <option value="https">HTTPS (Port 443)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5 font-semibold">Health Check Path</label>
                <input
                  type="text"
                  placeholder="/"
                  value={healthPath}
                  onChange={(e) => setHealthPath(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Initial Backend Server Selection */}
          <div className="space-y-2">
            <label className="text-[11px] text-slate-400 block font-semibold">
              Select Initial Backend Pool Servers (Optional):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {servers.map((s) => {
                const isSelected = selectedServerIds.includes(s.id)
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => handleToggleCreateServer(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-sky-600/20 border-sky-500/50 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-semibold text-xs truncate">{s.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {s.networks?.v4?.[0]?.ip_address || `#${s.id}`} • {s.region?.slug?.toUpperCase()}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-sky-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {createError && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLbMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow disabled:opacity-50"
            >
              {createLbMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>Deploy Load Balancer</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Load Balancers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {lbsQuery.isLoading && (
          <div className="col-span-2 py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          </div>
        )}

        {!lbsQuery.isLoading && loadBalancers.length === 0 && (
          <div className="col-span-2 text-xs text-slate-400 p-8 text-center bg-slate-900/30 border border-slate-800/80 rounded-2xl space-y-2">
            <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mx-auto text-sky-400">
              <Layers className="w-5 h-5" />
            </div>
            <div className="font-semibold text-white text-sm">No Load Balancers Deployed</div>
            <p className="text-slate-500 max-w-sm mx-auto text-[11px]">
              Deploy a load balancer to automatically distribute HTTP/HTTPS incoming traffic across your backend compute instances.
            </p>
          </div>
        )}

        {loadBalancers.map((lb) => {
          // Find all servers belonging to this Load Balancer pool (handle number[], string[], and object[])
          const rawIds = (lb.server_ids || (lb as any).servers || []) as any[]
          const memberServerIds: number[] = rawIds.map((item: any) =>
            typeof item === 'object' && item !== null ? Number(item.id) : Number(item)
          ).filter((n) => !isNaN(n) && n > 0)

          const memberServers = servers.filter((s) =>
            memberServerIds.some((mid) => mid === s.id)
          )
          const isHealthy = lb.status === 'active'

          return (
            <div
              key={lb.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between"
            >
              <div>
                {/* LB Card Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          isHealthy
                            ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                            : 'bg-amber-400 animate-pulse'
                        }`}
                      />
                      <h3 className="text-sm font-bold text-white">{lb.name}</h3>
                      <span className="text-[10px] text-slate-500 font-mono">#{lb.id}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-sky-400 font-semibold">{lb.ip || 'Provisioning IP...'}</span>
                      {lb.ip && (
                        <button
                          onClick={() => handleCopy(lb.ip)}
                          className="p-1 text-slate-500 hover:text-slate-200 transition"
                          title="Copy IP"
                        >
                          {copiedIp === lb.ip ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-800 text-slate-300">
                      {lb.region?.slug?.toUpperCase() || 'Global Anycast'}
                    </span>

                    <button
                      onClick={() => handleDeleteLb(lb.id, lb.name)}
                      disabled={deleteLbMutation.isPending}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                      title="Delete Load Balancer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Forwarding Rules & Health Check Badges */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  {(lb.forwarding_rules || []).map((rule, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-md text-slate-300 font-mono"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-sky-400" />
                      <span>{rule.entry_protocol?.toUpperCase()} Routing</span>
                    </span>
                  ))}

                  {lb.health_check && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-md text-emerald-400 font-mono">
                      <Activity className="w-3 h-3" />
                      <span>Health Check: {lb.health_check.protocol?.toUpperCase()} {lb.health_check.path}</span>
                    </span>
                  )}
                </div>

                {/* Backend Server Pool Section */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-sky-400" />
                      <span>Backend Server Pool ({memberServers.length})</span>
                    </span>

                    {/* Add Server Button */}
                    <button
                      onClick={() => {
                        const candidates = servers.filter((s) => !memberServerIds.some((mid) => mid === s.id))
                        if (candidates.length > 0) {
                          setSelectedServerToAttach(candidates[0].id)
                        }
                        setAttachModalLb(lb)
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/60 rounded transition"
                      title="Add a compute server to this load balancer pool"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Add Server</span>
                    </button>
                  </div>

                  {memberServers.length === 0 ? (
                    <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/80 text-center text-xs text-slate-500 space-y-2">
                      <div>No compute servers currently in this backend pool.</div>
                      <button
                        onClick={() => {
                          const candidates = servers.filter((s) => !memberServerIds.some((mid) => mid === s.id))
                          if (candidates.length > 0) setSelectedServerToAttach(candidates[0].id)
                          setAttachModalLb(lb)
                        }}
                        className="px-2.5 py-1 text-[11px] text-sky-400 bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 rounded-lg transition"
                      >
                        Add Existing Server to Pool
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {memberServers.map((server) => {
                        const isRunning = server.status === 'active'
                        const isProcessing = actionServerId === server.id
                        const ip = server.networks?.v4?.[0]?.ip_address || 'No IP'

                        return (
                          <div
                            key={server.id}
                            className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800/90 rounded-xl text-xs hover:border-slate-700 transition"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400'
                                }`}
                              />
                              <div className="truncate">
                                <div className="font-semibold text-slate-100 truncate">{server.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">{ip}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              {onSelectServer && (
                                <button
                                  onClick={() => onSelectServer(server)}
                                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition"
                                  title="Open Server Management"
                                >
                                  <span>Manage</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              {/* Remove Server from Pool */}
                              <button
                                onClick={() => handleRemoveServer(lb, server)}
                                disabled={isProcessing}
                                className="p-1 text-slate-500 hover:text-rose-400 bg-slate-800/50 hover:bg-rose-950/60 hover:border-rose-800/50 border border-transparent rounded transition"
                                title="Remove server from backend pool"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                ) : (
                                  <Unlink className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Status: {lb.status?.toUpperCase()}</span>
                <span>Automatic Failover Active</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* --- ADD SERVER TO POOL MODAL --- */}
      {attachModalLb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in select-text">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">
                  Add Server to {attachModalLb.name}
                </h3>
              </div>
              <button
                onClick={() => setAttachModalLb(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAttachServer} className="p-5 space-y-4 text-xs">
              <p className="text-slate-400">
                Select a server to add to the load balancer pool for{' '}
                <strong className="text-sky-400">{attachModalLb.name}</strong>:
              </p>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                  Select Server
                </label>
                <select
                  value={selectedServerToAttach || ''}
                  onChange={(e) => setSelectedServerToAttach(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium"
                >
                  {servers
                    .filter((s) => {
                      const raw = (attachModalLb.server_ids || (attachModalLb as any).servers || []) as any[]
                      const existingIds = raw.map((item: any) =>
                        typeof item === 'object' && item !== null ? Number(item.id) : Number(item)
                      )
                      return !existingIds.some((eid) => eid === s.id)
                    })
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`}) — {s.region?.slug?.toUpperCase()}
                      </option>
                    ))}
                </select>
              </div>

              {servers.filter((s) => {
                const raw = (attachModalLb.server_ids || (attachModalLb as any).servers || []) as any[]
                const existingIds = raw.map((item: any) =>
                  typeof item === 'object' && item !== null ? Number(item.id) : Number(item)
                )
                return !existingIds.some((eid) => eid === s.id)
              }).length === 0 && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>All your servers are already in this load balancer pool!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAttachModalLb(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addServerMutation.isPending || !selectedServerToAttach}
                  className="flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow disabled:opacity-50"
                >
                  {addServerMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding to Pool...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add to Pool</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
