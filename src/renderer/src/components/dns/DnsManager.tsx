import React, { useState } from 'react'
import { Globe, Plus, Trash2, RefreshCw, Search, Check, AlertCircle, Loader2 } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useDomains, useDomainRecords } from '../../api/queries'

interface DnsManagerProps {
  client: BinaryLaneClient | null
}

export const DnsManager: React.FC<DnsManagerProps> = ({ client }) => {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddingRecord, setIsAddingRecord] = useState(false)
  const [recordType, setRecordType] = useState('A')
  const [recordName, setRecordName] = useState('@')
  const [recordData, setRecordData] = useState('')
  const [recordTtl, setRecordTtl] = useState(300)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const domainsQuery = useDomains(client)
  const recordsQuery = useDomainRecords(client, selectedDomain)

  const domains = domainsQuery.data || []
  const records = recordsQuery.data || []

  const handleSelectDomain = (domainName: string) => {
    setSelectedDomain(domainName)
  }

  const handleFlushCache = async () => {
    if (!client) return
    try {
      await client.POST('/v2/domains/refresh_nameserver_cache')
      window.bldeskApi.sendNotification({
        title: 'DNS Cache Flushed',
        body: 'BinaryLane authoritative nameserver cache refreshed successfully.'
      })
    } catch (err: any) {
      alert(`Flush failed: ${err.message}`)
    }
  }

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client || !selectedDomain) return

    setIsSubmitting(true)
    try {
      await client.POST('/v2/domains/{domain_name}/records', {
        params: { path: { domain_name: selectedDomain } },
        body: {
          type: recordType,
          name: recordName.trim(),
          data: recordData.trim(),
          ttl: Number(recordTtl)
        }
      })
      setIsAddingRecord(false)
      setRecordName('@')
      setRecordData('')
      recordsQuery.refetch()
      window.bldeskApi.sendNotification({
        title: 'DNS Record Created',
        body: `Created ${recordType} record for ${selectedDomain}.`
      })
    } catch (err: any) {
      alert(`Failed to create record: ${err.message || 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRecord = async (recordId: number) => {
    if (!client || !selectedDomain) return
    if (!confirm('Are you sure you want to delete this DNS record?')) return

    try {
      await client.DELETE('/v2/domains/{domain_name}/records/{record_id}', {
        params: { path: { domain_name: selectedDomain, record_id: recordId } }
      })
      recordsQuery.refetch()
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message}`)
    }
  }

  const filteredRecords = records.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.data?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.type?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-sky-400" />
            <span>DNS & Domain Zones</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Authoritative Anycast DNS management for your domains</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleFlushCache}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            title="Flush Nameserver Cache"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Flush Nameserver Cache</span>
          </button>
        </div>
      </div>

      {/* Domain Selection & Records Layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1">
        {/* Left column: Domain list */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            Domains ({domains.length})
          </div>

          {domainsQuery.isLoading && (
            <div className="p-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
            </div>
          )}

          {domains.length === 0 && !domainsQuery.isLoading && (
            <div className="text-xs text-slate-500 p-4 text-center">No domains configured.</div>
          )}

          <div className="space-y-1">
            {domains.map((domain) => {
              const isSelected = selectedDomain === domain.name
              return (
                <button
                  key={domain.name}
                  onClick={() => handleSelectDomain(domain.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <span className="truncate">{domain.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">TTL: {domain.ttl}s</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right column: Records table */}
        <div className="md:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col">
          {selectedDomain ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{selectedDomain}</span>
                    <span className="text-xs font-normal text-slate-400">({records.length} records)</span>
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search records..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-44"
                    />
                  </div>

                  <button
                    onClick={() => setIsAddingRecord(!isAddingRecord)}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Record</span>
                  </button>
                </div>
              </div>

              {/* Add Record Form */}
              {isAddingRecord && (
                <form
                  onSubmit={handleCreateRecord}
                  className="p-3.5 bg-slate-950 border border-sky-500/40 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs animate-in fade-in"
                >
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Type</label>
                    <select
                      value={recordType}
                      onChange={(e) => setRecordType(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    >
                      {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA'].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Host / Name</label>
                    <input
                      type="text"
                      placeholder="@ or subdomain"
                      value={recordName}
                      onChange={(e) => setRecordName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Target / Value</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.0.2.1"
                      value={recordData}
                      onChange={(e) => setRecordData(e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Record'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingRecord(false)}
                      className="px-2.5 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Records Table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Target / Value</th>
                      <th className="py-2 px-3">TTL</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-950 text-sky-400 border border-sky-800/50">
                            {rec.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-white">{rec.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300 break-all">{rec.data}</td>
                        <td className="py-2.5 px-3 text-slate-500">{rec.ttl}s</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Globe className="w-8 h-8 text-slate-600" />
              <p className="text-xs">Select a domain from the left to view and manage DNS records.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
