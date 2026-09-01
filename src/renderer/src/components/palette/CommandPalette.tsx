import React, { useState, useEffect } from 'react'
import { Search, Server, Globe, Receipt, Terminal, Network, Shield, Layers, LucideIcon } from 'lucide-react'
import { components } from '@shared/api/schema'

type ServerResponse = components['schemas']['Server']

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: string
  icon: LucideIcon
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  servers: ServerResponse[]
  onSelectServer: (server: ServerResponse) => void
  onNavigateTab: (tab: any) => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  servers,
  onSelectServer,
  onNavigateTab
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        isOpen ? onClose() : null
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Navigation Items
  const navActions: CommandItem[] = [
    { id: 'nav-servers', title: 'Go to Virtual Servers', category: 'Navigation', icon: Server, action: () => { onNavigateTab('servers'); onClose(); } },
    { id: 'nav-vpcs', title: 'Go to VPC Networks', category: 'Navigation', icon: Network, action: () => { onNavigateTab('vpcs'); onClose(); } },
    { id: 'nav-firewall', title: 'Go to Firewall Rules', category: 'Navigation', icon: Shield, action: () => { onNavigateTab('firewall'); onClose(); } },
    { id: 'nav-loadbalancers', title: 'Go to Load Balancers', category: 'Navigation', icon: Layers, action: () => { onNavigateTab('loadbalancers'); onClose(); } },
    { id: 'nav-terminal', title: 'Open Embedded SSH Shell', category: 'Navigation', icon: Terminal, action: () => { onNavigateTab('terminal'); onClose(); } },
    { id: 'nav-dns', title: 'Manage DNS Domains & Records', category: 'Navigation', icon: Globe, action: () => { onNavigateTab('dns'); onClose(); } },
    { id: 'nav-billing', title: 'View Billing & Invoices', category: 'Navigation', icon: Receipt, action: () => { onNavigateTab('billing'); onClose(); } }
  ]

  // Server Items
  const serverActions: CommandItem[] = servers.map((s) => ({
    id: `server-${s.id}`,
    title: s.name,
    subtitle: `${s.networks?.v4?.[0]?.ip_address || 'No IP'} • ${s.region?.name || s.region?.slug} • ${s.vcpus} vCPU / ${(s.memory / 1024).toFixed(0)} GB`,
    category: 'Servers',
    icon: Server,
    action: () => {
      onSelectServer(s)
      onClose()
    }
  }))

  const allActions = [...navActions, ...serverActions]
  const filtered = allActions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  )

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].action()
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529]">
          <Search className="w-4 h-4 text-[#017cb6]" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, server name, or IP address..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDownList}
            className="w-full bg-transparent text-sm text-[#212529] dark:text-white placeholder-[#6c757d] focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] bg-black/10 dark:bg-black/40 text-[#6c757d] dark:text-slate-300 rounded border border-[#ced4da] dark:border-[#373b3e] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-transparent">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6c757d]">
              No matching commands or cloud resources found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#017cb6] text-white shadow-sm'
                      : 'hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] text-[#212529] dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`p-1.5 rounded ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-black/[0.05] dark:bg-white/[0.06] text-[#017cb6]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-semibold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div
                          className={`text-[11px] truncate ${
                            isSelected ? 'text-white/80' : 'text-[#6c757d] dark:text-slate-400'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ml-2 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-black/[0.05] dark:bg-black/30 text-[#6c757d]'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#f1f1f1] dark:bg-[#262a2e] border-t border-[#ced4da] dark:border-[#373b3e] text-[11px] text-[#6c757d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span className="font-semibold text-[#017cb6]">BLDesk Command Engine</span>
        </div>
      </div>
    </div>
  )
}
