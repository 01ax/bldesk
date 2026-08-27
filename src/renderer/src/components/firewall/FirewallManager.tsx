import React, { useState, useRef } from 'react'
import {
  Shield,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Server,
  Unlock,
  ChevronUp,
  ChevronDown,
  Download,
  Upload,
  Copy,
  Check,
  Share2,
  FileJson,
  X
} from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useServers, useFirewallRules, useUpdateFirewallRulesMutation } from '../../api/queries'

interface FirewallManagerProps {
  client: BinaryLaneClient | null
  initialServerId?: number | null
}

export const FirewallManager: React.FC<FirewallManagerProps> = ({ client, initialServerId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const serversQuery = useServers(client)
  const servers = serversQuery.data || []

  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    initialServerId || (servers.length > 0 ? servers[0].id : null)
  )

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : null)
  const activeServer = servers.find((s) => s.id === activeServerId)

  const firewallQuery = useFirewallRules(client, activeServerId)
  const updateFirewall = useUpdateFirewallRulesMutation(client, activeServerId)

  // Add Rule Form States
  const [isAdding, setIsAdding] = useState(false)
  const [ruleAction, setRuleAction] = useState<'accept' | 'drop'>('accept')
  const [ruleProtocol, setRuleProtocol] = useState<'tcp' | 'udp' | 'icmp' | 'all'>('tcp')
  const [rulePorts, setRulePorts] = useState('22')
  const [ruleSource, setRuleSource] = useState('0.0.0.0/0')
  const [ruleDescription, setRuleDescription] = useState('Allow SSH')
  const [rulePlacement, setRulePlacement] = useState<'top' | 'bottom' | 'before_drop'>('before_drop')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Import / Export States
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [copiedJson, setCopiedJson] = useState(false)

  // Clone to Server States
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [targetCloneServerId, setTargetCloneServerId] = useState<number | null>(null)
  const [isCloning, setIsCloning] = useState(false)

  const currentRules: any[] = firewallQuery.data || []
  const hasCatchAllDrop = currentRules.length > 0 && currentRules[currentRules.length - 1]?.action === 'drop'

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
        setRulePlacement('bottom')
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

    let updatedRules = [...currentRules]

    if (rulePlacement === 'top') {
      updatedRules.unshift(newRule)
    } else if (rulePlacement === 'before_drop' && hasCatchAllDrop) {
      updatedRules.splice(updatedRules.length - 1, 0, newRule)
    } else {
      updatedRules.push(newRule)
    }

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

  const handleMoveRule = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentRules.length) return

    const updatedRules = [...currentRules]
    const temp = updatedRules[index]
    updatedRules[index] = updatedRules[targetIndex]
    updatedRules[targetIndex] = temp

    try {
      await updateFirewall.mutateAsync(updatedRules)
    } catch (err: any) {
      alert(`Failed to reorder rules: ${err.message}`)
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

  // --- DOWNLOAD / EXPORT FIREWALL RULES ---
  const handleDownloadRules = () => {
    if (currentRules.length === 0) {
      alert('No active firewall rules to download.')
      return
    }
    const jsonStr = JSON.stringify(currentRules, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firewall-rules-${activeServer?.name || activeServerId}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(currentRules, null, 2)
    navigator.clipboard.writeText(jsonStr)
    setCopiedJson(true)
    setTimeout(() => setCopiedJson(false), 1500)
  }

  // --- UPLOAD / IMPORT FIREWALL RULES ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        setImportJsonText(text)
        setImportError(null)
      } catch (err: any) {
        setImportError('Failed to read file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleApplyImportedRules = async () => {
    setImportError(null)
    if (!importJsonText.trim()) {
      setImportError('Please paste or upload JSON rules.')
      return
    }

    try {
      let parsed = JSON.parse(importJsonText)
      if (!Array.isArray(parsed) && Array.isArray((parsed as any)?.firewall_rules)) {
        parsed = (parsed as any).firewall_rules
      }

      if (!Array.isArray(parsed)) {
        throw new Error('Rules JSON must be an array of firewall rule objects.')
      }

      // Format & sanitize rules
      const sanitized = parsed.map((r: any) => ({
        action: r.action === 'drop' ? 'drop' : 'accept',
        protocol: r.protocol || 'tcp',
        source_addresses: Array.isArray(r.source_addresses) ? r.source_addresses : [r.source_addresses || '0.0.0.0/0'],
        destination_addresses: Array.isArray(r.destination_addresses) ? r.destination_addresses : ['0.0.0.0/0'],
        destination_ports: Array.isArray(r.destination_ports)
          ? r.destination_ports
          : r.destination_ports
          ? [String(r.destination_ports)]
          : null,
        description: r.description || null
      }))

      await updateFirewall.mutateAsync(sanitized)
      setIsImportOpen(false)
      setImportJsonText('')
      window.bldeskApi.sendNotification({
        title: 'Firewall Policy Imported',
        body: `Applied ${sanitized.length} firewall rules to "${activeServer?.name || activeServerId}".`
      })
    } catch (err: any) {
      setImportError(err.message || 'Invalid JSON rules format.')
    }
  }

  // --- CLONE RULES TO ANOTHER SERVER ---
  const handleCloneToServer = async () => {
    if (!client || !targetCloneServerId) return
    if (!confirm(`Apply this ruleset (${currentRules.length} rules) to target server #${targetCloneServerId}?`)) return

    setIsCloning(true)
    try {
      await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: targetCloneServerId } },
        body: {
          type: 'change_advanced_firewall_rules',
          firewall_rules: currentRules
        }
      })
      setIsCloneOpen(false)
      window.bldeskApi.sendNotification({
        title: 'Firewall Rules Cloned',
        body: `Successfully cloned policy to target server #${targetCloneServerId}.`
      })
    } catch (err: any) {
      alert(`Failed to clone rules: ${err.message}`)
    } finally {
      setIsCloning(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header & Server Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-sky-400" />
            <span>Stateful Cloud Firewall</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Sequential packet filtering & ingress security rules (Evaluated top to bottom)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Server Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 border border-slate-800 rounded-lg">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[160px]"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`})
                </option>
              ))}
            </select>
          </div>

          {/* Import / Export & Clone Buttons */}
          <button
            onClick={handleDownloadRules}
            disabled={currentRules.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition disabled:opacity-40"
            title="Download Ruleset JSON File"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
            title="Import or Restore Rules from JSON"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span>Import JSON</span>
          </button>

          {servers.length > 1 && (
            <button
              onClick={() => {
                const other = servers.find((s) => s.id !== activeServerId)
                if (other) setTargetCloneServerId(other.id)
                setIsCloneOpen(true)
              }}
              disabled={currentRules.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition disabled:opacity-40"
              title="Clone Current Policy to Another Server"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Clone to Server</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsAdding(!isAdding)
              if (!isAdding && hasCatchAllDrop) {
                setRulePlacement('before_drop')
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] text-slate-400 block mb-1">Rule Description / Label</label>
              <input
                type="text"
                placeholder="e.g. Allow Web & Admin Access from Office"
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>

            {/* Position / Placement selector */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Evaluation Order / Position</label>
              <select
                value={rulePlacement}
                onChange={(e) => setRulePlacement(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium"
              >
                {hasCatchAllDrop && (
                  <option value="before_drop">
                    Insert Before Final DROP (Recommended)
                  </option>
                )}
                <option value="top">Insert at Top (Position #1 - Highest Priority)</option>
                <option value="bottom">Append to Bottom (Lowest Priority)</option>
              </select>
            </div>
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
                  <span>Apply Rule in Order</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Rules Table / Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Active Firewall Rules ({currentRules.length})</h2>
              <span className="text-[10px] text-sky-400 font-medium px-2 py-0.5 bg-sky-950 border border-sky-800/60 rounded">
                Evaluated Top to Bottom
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              The first rule matching incoming traffic takes effect. Use the 🔼 and 🔽 buttons to adjust precedence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentRules.length > 0 && (
              <>
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition"
                  title="Copy formatted JSON rules to clipboard"
                >
                  {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                </button>

                <button
                  onClick={handleClearAll}
                  disabled={updateFirewall.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-800/40 rounded transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All Rules</span>
                </button>
              </>
            )}
          </div>
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
              const isFirst = idx === 0
              const isLast = idx === currentRules.length - 1

              return (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3">
                    {/* Position Priority & Move Up/Down */}
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800/80 px-1.5 py-0.5 rounded-lg">
                      <span className="font-mono text-[10px] text-slate-400 font-bold w-4 text-center">
                        #{idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMoveRule(idx, 'up')}
                          disabled={isFirst || updateFirewall.isPending}
                          className="text-slate-500 hover:text-sky-400 disabled:opacity-20 disabled:hover:text-slate-500 transition"
                          title="Move Up (Higher Priority)"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMoveRule(idx, 'down')}
                          disabled={isLast || updateFirewall.isPending}
                          className="text-slate-500 hover:text-sky-400 disabled:opacity-20 disabled:hover:text-slate-500 transition"
                          title="Move Down (Lower Priority)"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

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

      {/* --- IMPORT FIREWALL MODAL --- */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in select-text">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <FileJson className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">Import Firewall Policy (JSON)</h3>
              </div>
              <button
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Upload .json file or paste rules JSON:
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 border border-dashed border-slate-700 hover:border-purple-500/80 bg-slate-950/60 rounded-xl text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose JSON File from Computer</span>
                </button>
              </div>

              <div>
                <textarea
                  rows={8}
                  placeholder={`[\n  {\n    "action": "accept",\n    "protocol": "tcp",\n    "destination_ports": ["22", "80", "443"],\n    "source_addresses": ["0.0.0.0/0"],\n    "description": "Allow Web & SSH"\n  }\n]`}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-purple-500"
                />
              </div>

              {importError && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyImportedRules}
                  disabled={updateFirewall.isPending}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition shadow disabled:opacity-50"
                >
                  {updateFirewall.isPending ? 'Applying Policy...' : 'Apply Imported Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CLONE TO SERVER MODAL --- */}
      {isCloneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in select-text">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Clone Firewall Policy to Server</h3>
              </div>
              <button
                onClick={() => setIsCloneOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-400">
                Copy all <strong className="text-white">{currentRules.length} rules</strong> from{' '}
                <strong className="text-sky-400">{activeServer?.name}</strong> to:
              </p>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Target Server</label>
                <select
                  value={targetCloneServerId || ''}
                  onChange={(e) => setTargetCloneServerId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                >
                  {servers
                    .filter((s) => s.id !== activeServerId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCloneOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCloneToServer}
                  disabled={isCloning || !targetCloneServerId}
                  className="px-4 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow disabled:opacity-50"
                >
                  {isCloning ? 'Cloning Policy...' : 'Apply to Target Server'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
