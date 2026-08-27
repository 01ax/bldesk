import React, { useState } from 'react'
import {
  Network,
  Plus,
  Server,
  Loader2,
  ArrowRight,
  UserPlus,
  Unlink,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import { useVpcs, useServers } from '../../api/queries'

type ServerResponse = components['schemas']['Server']

interface VpcManagerProps {
  client: BinaryLaneClient | null
  onSelectServer?: (server: ServerResponse) => void
}

export const VpcManager: React.FC<VpcManagerProps> = ({ client, onSelectServer }) => {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [vpcName, setVpcName] = useState('')
  const [ipRange, setIpRange] = useState('10.240.0.0/16')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Attach Server Modal States
  const [attachModalVpc, setAttachModalVpc] = useState<any | null>(null)
  const [selectedServerToAttach, setSelectedServerToAttach] = useState<number | null>(null)
  const [isAttaching, setIsAttaching] = useState(false)
  const [actionServerId, setActionServerId] = useState<number | null>(null)

  const vpcsQuery = useVpcs(client)
  const serversQuery = useServers(client)

  const vpcs = vpcsQuery.data || []
  const servers = serversQuery.data || []

  // Create new VPC
  const handleCreateVpc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return

    setIsSubmitting(true)
    try {
      await client.POST('/v2/vpcs', {
        body: {
          name: vpcName.trim(),
          ip_range: ipRange.trim()
        }
      })
      setIsCreating(false)
      setVpcName('')
      vpcsQuery.refetch()
      window.bldeskApi.sendNotification({
        title: 'VPC Created',
        body: `Virtual Private Cloud "${vpcName}" created successfully.`
      })
    } catch (err: any) {
      alert(`Failed to create VPC: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Attach / Move Server to VPC
  const handleAttachServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client || !attachModalVpc || !selectedServerToAttach) return

    setIsAttaching(true)
    try {
      await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: selectedServerToAttach } },
        body: {
          type: 'change_network',
          vpc_id: attachModalVpc.id
        }
      })

      const targetServerName = servers.find((s) => s.id === selectedServerToAttach)?.name || selectedServerToAttach
      window.bldeskApi.sendNotification({
        title: 'Server Attached to VPC',
        body: `Moved "${targetServerName}" into VPC "${attachModalVpc.name}".`
      })

      setAttachModalVpc(null)
      setSelectedServerToAttach(null)
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['vpcs'] })
    } catch (err: any) {
      alert(`Failed to attach server: ${err.message}`)
    } finally {
      setIsAttaching(false)
    }
  }

  // Remove / Detach Server from VPC back to Public Network
  const handleRemoveServerFromVpc = async (server: ServerResponse, vpcName: string) => {
    if (!client) return
    const confirmed = confirm(
      `Remove server "${server.name}" from VPC "${vpcName}"?\n\nThe server will be moved back to the standard public network.`
    )
    if (!confirmed) return

    setActionServerId(server.id)
    try {
      await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: server.id } },
        body: {
          type: 'change_network',
          vpc_id: null as any
        }
      })

      window.bldeskApi.sendNotification({
        title: 'Server Detached from VPC',
        body: `"${server.name}" removed from VPC and returned to public network.`
      })

      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['vpcs'] })
    } catch (err: any) {
      alert(`Failed to detach server: ${err.message}`)
    } finally {
      setActionServerId(null)
    }
  }

  // Delete Empty VPC
  const handleDeleteVpc = async (vpcId: number, name: string) => {
    if (!client) return
    const confirmed = confirm(`Are you sure you want to permanently delete VPC "${name}"?`)
    if (!confirmed) return

    try {
      await client.DELETE('/v2/vpcs/{vpc_id}', {
        params: { path: { vpc_id: vpcId } }
      })
      window.bldeskApi.sendNotification({
        title: 'VPC Deleted',
        body: `Virtual Private Cloud "${name}" was deleted.`
      })
      vpcsQuery.refetch()
    } catch (err: any) {
      alert(`Failed to delete VPC: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Network className="w-5 h-5 text-sky-400" />
            <span>Virtual Private Clouds (VPC)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Isolated private virtual networks connecting your server instances</p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create VPC</span>
        </button>
      </div>

      {/* Create VPC Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateVpc}
          className="p-4 bg-slate-900/90 border border-sky-500/40 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in fade-in"
        >
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">VPC Name</label>
            <input
              type="text"
              placeholder="e.g. Production-VPC"
              value={vpcName}
              onChange={(e) => setVpcName(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">IP Range (CIDR)</label>
            <input
              type="text"
              placeholder="10.240.0.0/16"
              value={ipRange}
              onChange={(e) => setIpRange(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition"
            >
              {isSubmitting ? 'Creating...' : 'Provision VPC'}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* VPC Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {vpcsQuery.isLoading && (
          <div className="col-span-2 py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          </div>
        )}

        {!vpcsQuery.isLoading && vpcs.length === 0 && (
          <div className="col-span-2 text-xs text-slate-500 p-8 text-center bg-slate-900/30 rounded-xl">
            No VPC networks created. All instances use standard public routing.
          </div>
        )}

        {vpcs.map((vpc) => {
          // Find all servers belonging to this VPC
          const memberServers = servers.filter((s) => s.vpc_id === vpc.id)

          return (
            <div key={vpc.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                {/* VPC Card Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{vpc.name}</h3>
                      <span className="text-[10px] text-slate-500 font-mono">#{vpc.id}</span>
                    </div>
                    <div className="text-xs text-sky-400 font-mono font-semibold">{vpc.ip_range}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-800 text-slate-300">
                      {(vpc as any).region?.slug?.toUpperCase() || 'Global'}
                    </span>

                    {memberServers.length === 0 && (
                      <button
                        onClick={() => handleDeleteVpc(vpc.id, vpc.name)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        title="Delete Empty VPC"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Member Servers Section */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-sky-400" />
                      <span>Member Servers ({memberServers.length})</span>
                    </span>

                    {/* Add Server Button */}
                    <button
                      onClick={() => {
                        const candidates = servers.filter((s) => s.vpc_id !== vpc.id)
                        if (candidates.length > 0) {
                          setSelectedServerToAttach(candidates[0].id)
                        }
                        setAttachModalVpc(vpc)
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/60 rounded transition"
                      title="Add or Move an existing server into this VPC"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Add Server</span>
                    </button>
                  </div>

                  {memberServers.length === 0 ? (
                    <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800/80 text-center text-xs text-slate-500 space-y-2">
                      <div>No compute servers currently assigned to this VPC.</div>
                      <button
                        onClick={() => {
                          const candidates = servers.filter((s) => s.vpc_id !== vpc.id)
                          if (candidates.length > 0) setSelectedServerToAttach(candidates[0].id)
                          setAttachModalVpc(vpc)
                        }}
                        className="px-2.5 py-1 text-[11px] text-sky-400 bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 rounded-lg transition"
                      >
                        Add Existing Server to this VPC
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {memberServers.map((server) => {
                        const privateIp =
                          server.networks?.v4?.find((v) => v.type === 'private')?.ip_address ||
                          'Private IP assigned'
                        const publicIp =
                          server.networks?.v4?.find((v) => v.type === 'public')?.ip_address ||
                          server.networks?.v4?.[0]?.ip_address ||
                          'No public IP'
                        const isRunning = server.status === 'active'
                        const isProcessing = actionServerId === server.id

                        return (
                          <div
                            key={server.id}
                            className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800/90 rounded-lg text-xs hover:border-slate-700 transition"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400'
                                }`}
                              />
                              <div className="truncate">
                                <div className="font-semibold text-slate-100 truncate">{server.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                                  <span className="text-sky-400">{privateIp}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-slate-500">{publicIp}</span>
                                </div>
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

                              {/* Remove from VPC button */}
                              <button
                                onClick={() => handleRemoveServerFromVpc(server, vpc.name)}
                                disabled={isProcessing}
                                className="p-1 text-slate-500 hover:text-rose-400 bg-slate-800/50 hover:bg-rose-950/60 hover:border-rose-800/50 border border-transparent rounded transition"
                                title="Remove / Detach from VPC (Move to Public Network)"
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
                <span>Route Table Active</span>
                <span>Isolated Layer-2 VLAN</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* --- ATTACH / ADD SERVER MODAL --- */}
      {attachModalVpc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in select-text">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <Network className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">
                  Add Server to {attachModalVpc.name}
                </h3>
              </div>
              <button
                onClick={() => setAttachModalVpc(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAttachServer} className="p-5 space-y-4 text-xs">
              <p className="text-slate-400">
                Select an existing compute server to attach to{' '}
                <strong className="text-sky-400">{attachModalVpc.name}</strong> ({attachModalVpc.ip_range}):
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
                    .filter((s) => s.vpc_id !== attachModalVpc.id)
                    .map((s) => {
                      const currentVpc = vpcs.find((v) => v.id === s.vpc_id)
                      const locationLabel = currentVpc ? `Currently in ${currentVpc.name}` : 'Public Network'
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`}) — {locationLabel}
                        </option>
                      )
                    })}
                </select>
              </div>

              {servers.filter((s) => s.vpc_id !== attachModalVpc.id).length === 0 && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>All your servers are already members of this VPC!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAttachModalVpc(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAttaching || !selectedServerToAttach || servers.filter((s) => s.vpc_id !== attachModalVpc.id).length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow disabled:opacity-50"
                >
                  {isAttaching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Attaching...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Attach to VPC</span>
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
