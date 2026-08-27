import React, { useState } from 'react'
import {
  Shield,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Server,
  Unlock
} from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useServers, useFirewallRules, useUpdateFirewallRulesMutation } from '../../api/queries'

interface FirewallManagerProps {
  client: BinaryLaneClient | null
  initialServerId?: number | null
}

export const FirewallManager: React.FC<FirewallManagerProps> = ({ client, initialServerId }) => {
  const serversQuery = useServers(client)
  const servers = serversQuery.data || []

  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    initialServerId || (servers.length > 0 ? servers[0].id : null)
  )

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : null)
  const activeServer = servers.find((s) => s.id === activeServerId)

  const firewallQuery = useFirewallRules(client, activeServerId)
  const updateFirewall = useUpdateFirewallRulesMutation(client, activeServerId)

  const [isAdding, setIsAdding] = useState(false)
  const [ruleAction, setRuleAction] = useState<'accept' | 'drop'>('accept')
  const [ruleProtocol, setRuleProtocol] = useState<'tcp' | 'udp' | 'icmp' | 'all'>('tcp')
  const [rulePorts, setRulePorts] = useState('22')
  const [ruleSource, setRuleSource] = useState('0.0.0.0/0')
  const [ruleDescription, setRuleDescription] = useState('Allow SSH')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const currentRules: any[] = firewallQuery.data || []

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'ssh':
        setRuleAction('accept')
        setRuleProtocol('tcp')
        setRulePorts('22')
        setRuleSource('0.0.0.0/0')
        setRuleDescription('Allow SSH Access')
        break
      case 'web':
        setRuleAction('accept')
        setRuleProtocol('tcp')
        setRulePorts('80, 443')
        setRuleSource('0.0.0.0/0')
        setRuleDescription('Allow HTTP / HTTPS Web Traffic')
        break
      case 'web_ssh':
        setRuleAction('accept')
        setRuleProtocol('tcp')
        setRulePorts('22, 80, 443')
        setRuleSource('0.0.0.0/0')
        setRuleDescription('Allow Web (80/443) & SSH (22)')
        break
      case 'db':
        setRuleAction('accept')
        setRuleProtocol('tcp')
        setRulePorts('3306, 5432')
        setRuleSource('10.240.0.0/16')
        setRuleDescription('Allow VPC Database Traffic')
        break
      case 'block_all':
        setRuleAction('drop')
        setRuleProtocol('all')
        setRulePorts('')
        setRuleSource('0.0.0.0/0')
        setRuleDescription('Drop All Other Inbound Traffic')
        break
    }
  }

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!activeServerId) return

    const portsList = rulePorts
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    const sourceList = ruleSource
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (sourceList.length === 0) {
      setErrorMsg('Please specify at least one source IP or CIDR range (e.g. 0.0.0.0/0).')
      return
    }

    const newRule = {
      action: ruleAction,
      protocol: ruleProtocol,
      source_addresses: sourceList,
      destination_addresses: ['0.0.0.0/0'],
      destination_ports: portsList.length > 0 ? portsList : null,
      description: ruleDescription.trim() || null
    }

    const updatedRules = [...currentRules, newRule]

    try {
      await updateFirewall.mutateAsync(updatedRules)
      setIsAdding(false)
      setRuleDescription('')
      window.bldeskApi.sendNotification({
        title: 'Firewall Rule Added',
        body: `Updated firewall policy on "${activeServer?.name || activeServerId}".`
      })
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update firewall rules.')
    }
  }

  const handleDeleteRule = async (index: number) => {
    if (!confirm('Are you sure you want to remove this firewall rule?')) return

    const updatedRules = currentRules.filter((_, idx) => idx !== index)

    try {
      await updateFirewall.mutateAsync(updatedRules)
      window.bldeskApi.sendNotification({
        title: 'Firewall Rule Removed',
        body: `Removed rule from "${activeServer?.name || activeServerId}".`
      })
    } catch (err: any) {
      alert(`Failed to delete rule: ${err.message}`)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all firewall rules? All inbound traffic will be permitted.')) return

    try {
      await updateFirewall.mutateAsync([])
      window.bldeskApi.sendNotification({
        title: 'Firewall Rules Cleared',
        body: `Default permit-all policy restored on "${activeServer?.name || activeServerId}".`
      })
    } catch (err: any) {
      alert(`Failed to clear rules: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header & Server Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-sky-400" />
            <span>Stateful Cloud Firewall</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Network layer packet filtering & ingress security rules for your instances
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Server Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 border border-slate-800 rounded-lg">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Add Rule Form */}
      {isAdding && (
        <form
          onSubmit={handleAddRule}
          className="p-5 bg-slate-900/90 border border-sky-500/40 rounded-xl space-y-4 text-xs animate-in fade-in shadow-xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-bold text-white">Add Ingress Firewall Rule</h2>
            </div>

            {/* Quick Presets Bar */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('ssh')}
                className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 hover:text-white rounded transition"
              >
                SSH (22)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('web')}
                className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 hover:text-white rounded transition"
              >
                HTTP/HTTPS
              </button>
              <button
                type="button"
                onClick={() => applyPreset('web_ssh')}
                className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 hover:text-white rounded transition"
              >
                Web + SSH
              </button>
              <button
                type="button"
                onClick={() => applyPreset('db')}
                className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 hover:text-white rounded transition"
              >
                VPC DB
              </button>
              <button
                type="button"
                onClick={() => applyPreset('block_all')}
                className="px-2 py-0.5 text-[10px] font-medium bg-rose-950/60 text-rose-300 border border-rose-800/40 hover:bg-rose-900 rounded transition"
              >
                Drop All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Action</label>
              <select
                value={ruleAction}
                onChange={(e) => setRuleAction(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium"
              >
                <option value="accept">ACCEPT (Allow Traffic)</option>
                <option value="drop">DROP (Block Traffic)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Protocol</label>
              <select
                value={ruleProtocol}
                onChange={(e) => setRuleProtocol(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white uppercase font-mono"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP (Ping)</option>
                <option value="all">ALL Protocols</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Destination Port(s)</label>
              <input
                type="text"
                placeholder="e.g. 22 or 80, 443 (blank = all)"
                value={rulePorts}
                onChange={(e) => setRulePorts(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Source CIDR / IP Range</label>
              <input
                type="text"
                required
                placeholder="0.0.0.0/0 or IP/32"
                value={ruleSource}
                onChange={(e) => setRuleSource(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Rule Description / Label</label>
            <input
              type="text"
              placeholder="e.g. Allow Web & Admin Access from Office"
              value={ruleDescription}
              onChange={(e) => setRuleDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateFirewall.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow disabled:opacity-50"
            >
              {updateFirewall.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Policy...</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span>Apply Rule</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Rules Table / Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Active Firewall Rules ({currentRules.length})</h2>
            <span className="text-[10px] text-slate-500 font-mono">
              Evaluated sequentially from top to bottom
            </span>
          </div>

          {currentRules.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={updateFirewall.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-800/40 rounded transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All Rules (Permit All)</span>
            </button>
          )}
        </div>

        {firewallQuery.isLoading && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          </div>
        )}

        {!firewallQuery.isLoading && currentRules.length === 0 && (
          <div className="text-xs text-slate-400 p-8 text-center bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <Unlock className="w-5 h-5" />
            </div>
            <div className="font-semibold text-white">Default Policy: Permit All Traffic</div>
            <p className="text-slate-500 max-w-sm mx-auto text-[11px]">
              No ingress filtering rules are currently applied to this server. All inbound ports and protocols are open.
            </p>
          </div>
        )}

        {!firewallQuery.isLoading && currentRules.length > 0 && (
          <div className="space-y-2">
            {currentRules.map((rule, idx) => {
              const isAccept = rule.action === 'accept'
              const ports = rule.destination_ports?.join(', ') || 'Any / All Ports'
              const sources = rule.source_addresses?.join(', ') || '0.0.0.0/0'

              return (
                <div
                  key={idx}
                  className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-slate-500 font-bold w-4">
                      #{idx + 1}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        isAccept
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                      }`}
                    >
                      {rule.action}
                    </span>

                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-mono text-[11px] uppercase font-semibold">
                      {rule.protocol}
                    </span>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 font-mono text-xs">
                          Port: {ports}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          Source: {sources}
                        </span>
                      </div>
                      {rule.description && (
                        <div className="text-[11px] text-slate-500 font-medium">
                          {rule.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteRule(idx)}
                    disabled={updateFirewall.isPending}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
