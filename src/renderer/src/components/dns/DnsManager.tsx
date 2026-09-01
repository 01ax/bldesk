import React, { useState } from 'react'
import { Globe, Plus, Trash2, Search, RefreshCw, Loader2, X } from 'lucide-react'
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
  const [recordTtl] = useState(300)
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
      window.bldeskApi?.sendNotification?.({
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
          type: recordType as any,
          name: recordName.trim(),
          data: recordData.trim(),
          ttl: Number(recordTtl)
        }
      })
      setIsAddingRecord(false)
      setRecordName('@')
      setRecordData('')
      recordsQuery.refetch()
      window.bldeskApi?.sendNotification?.({
        title: 'DNS Record Added',
        body: `${recordType} record for ${recordName}.${selectedDomain} created.`
      })
    } catch (err: any) {
      alert(`Failed to add record: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRecord = async (recordId: number, name: string, type: string) => {
    if (!client || !selectedDomain) return
    if (!confirm(`Delete ${type} record "${name}" from ${selectedDomain}?`)) return

    try {
      await client.DELETE('/v2/domains/{domain_name}/records/{record_id}', {
        params: {
          path: {
            domain_name: selectedDomain,
            record_id: recordId
          }
        }
      })
      recordsQuery.refetch()
      window.bldeskApi?.sendNotification?.({
        title: 'DNS Record Deleted',
        body: `Deleted ${type} record #${recordId}.`
      })
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message}`)
    }
  }

  const filteredDomains = domains.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#212529] dark:text-white flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[#017cb6]" />
            <span>DNS Zones & Domains</span>
          </h1>
          <p className="text-xs text-[#6c757d] dark:text-slate-400 mt-0.5">
            Manage authoritative DNS records across anycast nameservers with instant propagation.
          </p>
        </div>

        <button
          onClick={handleFlushCache}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#212529] dark:text-slate-200 bg-white dark:bg-[#2b3035] hover:bg-[#f1f1f1] dark:hover:bg-[#343a40] border border-[#ced4da] dark:border-[#373b3e] rounded transition shadow-sm"
          title="Force nameserver cache flush"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Flush DNS Cache</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
        {/* Domain List Sidebar */}
        <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#ced4da] dark:border-[#373b3e] bg-[#f1f1f1] dark:bg-[#262a2e]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6c757d]" />
              <input
                type="text"
                placeholder="Filter domains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-[#017cb6]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
            {domainsQuery.isLoading && (
              <div className="p-4 text-center text-xs text-[#6c757d]">Loading domains...</div>
            )}

            {!domainsQuery.isLoading && filteredDomains.length === 0 && (
              <div className="p-6 text-center text-xs text-[#6c757d]">No DNS zones found</div>
            )}

            {filteredDomains.map((domain) => {
              const isSelected = selectedDomain === domain.name
              return (
                <button
                  key={domain.name}
                  onClick={() => handleSelectDomain(domain.name)}
                  className={`w-full text-left p-3 text-xs transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#017cb6]/10 text-[#017cb6] font-semibold border-l-4 border-[#017cb6]'
                      : 'hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] text-[#212529] dark:text-slate-200'
                  }`}
                >
                  <span className="font-mono">{domain.name}</span>
                  <span className="text-[10px] text-[#6c757d]">TTL {domain.ttl}s</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* DNS Records Panel */}
        <div className="md:col-span-2 bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm flex flex-col overflow-hidden">
          {selectedDomain ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-[#ced4da] dark:border-[#373b3e] bg-[#f1f1f1] dark:bg-[#262a2e] flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-[#212529] dark:text-white font-mono">
                    {selectedDomain}
                  </h3>
                  <span className="text-[11px] text-[#6c757d] dark:text-slate-400">
                    {records.length} {records.length === 1 ? 'record' : 'records'} configured
                  </span>
                </div>

                <button
                  onClick={() => setIsAddingRecord(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#017cb6] hover:bg-[#016594] rounded transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Record</span>
                </button>
              </div>

              {/* Records Table */}
              <div className="flex-1 overflow-y-auto">
                {recordsQuery.isLoading && (
                  <div className="p-8 text-center text-xs text-[#6c757d]">Loading records...</div>
                )}

                {!recordsQuery.isLoading && records.length === 0 && (
                  <div className="p-8 text-center text-xs text-[#6c757d]">
                    No custom DNS records in this zone yet.
                  </div>
                )}

                {!recordsQuery.isLoading && records.length > 0 && (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f8f9fa] dark:bg-[#212529] border-b border-[#ced4da] dark:border-[#373b3e] text-[#6c757d] font-medium">
                        <th className="py-2 px-4 w-20">Type</th>
                        <th className="py-2 px-4">Name</th>
                        <th className="py-2 px-4">Target / Data</th>
                        <th className="py-2 px-4 w-16 text-center">TTL</th>
                        <th className="py-2 px-4 w-12 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition">
                          <td className="py-2 px-4">
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#017cb6]/10 text-[#017cb6]">
                              {r.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 font-mono font-medium">{r.name}</td>
                          <td className="py-2 px-4 font-mono text-[#6c757d] dark:text-slate-300 break-all">
                            {r.data}
                          </td>
                          <td className="py-2 px-4 text-center font-mono text-[#6c757d]">{r.ttl}</td>
                          <td className="py-2 px-4 text-right">
                            <button
                              onClick={() => handleDeleteRecord(r.id, r.name, r.type)}
                              className="text-[#6c757d] hover:text-rose-500 p-1 rounded transition"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-[#6c757d]">
              <Globe className="w-8 h-8 text-[#6c757d]/50 mb-2" />
              <span>Select a domain zone on the left to manage records</span>
            </div>
          )}
        </div>
      </div>

      {/* Add Record Modal */}
      {isAddingRecord && selectedDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#ced4da] dark:border-[#373b3e] pb-3">
              <h2 className="text-base font-bold text-[#212529] dark:text-white">
                Add DNS Record to {selectedDomain}
              </h2>
              <button onClick={() => setIsAddingRecord(false)} className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRecord} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                    Record Type
                  </label>
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded focus:outline-none focus:border-[#017cb6]"
                  >
                    <option value="A">A (IPv4)</option>
                    <option value="AAAA">AAAA (IPv6)</option>
                    <option value="CNAME">CNAME</option>
                    <option value="MX">MX</option>
                    <option value="TXT">TXT</option>
                    <option value="NS">NS</option>
                    <option value="SRV">SRV</option>
                    <option value="CAA">CAA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                    Host / Subdomain
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="@ or www"
                    value={recordName}
                    onChange={(e) => setRecordName(e.target.value)}
                    className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded font-mono focus:outline-none focus:border-[#017cb6]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                  Target / Value
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 103.x.x.x or hostname.com"
                  value={recordData}
                  onChange={(e) => setRecordData(e.target.value)}
                  className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded font-mono focus:outline-none focus:border-[#017cb6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingRecord(false)}
                  className="px-3 py-1.5 text-xs text-[#6c757d] hover:text-[#212529] dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#017cb6] hover:bg-[#016594] text-white text-xs font-medium rounded transition flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
