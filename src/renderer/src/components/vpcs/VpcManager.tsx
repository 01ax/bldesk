import React, { useState } from 'react'
import { Network, Plus, Server, Loader2 } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useVpcs } from '../../api/queries'

interface VpcManagerProps {
  client: BinaryLaneClient | null
}

export const VpcManager: React.FC<VpcManagerProps> = ({ client }) => {
  const [isCreating, setIsCreating] = useState(false)
  const [vpcName, setVpcName] = useState('')
  const [ipRange, setIpRange] = useState('10.240.0.0/16')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const vpcsQuery = useVpcs(client)
  const vpcs = vpcsQuery.data || []

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {vpcs.map((vpc) => (
          <div key={vpc.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{vpc.name}</h3>
                  <span className="text-[10px] text-slate-500 font-mono">#{vpc.id}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1">{vpc.ip_range}</div>
              </div>

              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-800 text-slate-300">
                {(vpc as any).region?.slug?.toUpperCase() || 'Global'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800/80 text-slate-400">
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span>Member Servers</span>
              </div>
              <span className="text-[11px] text-slate-500">Route Table Active</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
