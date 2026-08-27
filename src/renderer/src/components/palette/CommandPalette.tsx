import React, { useState, useEffect } from 'react'
import { Search, Server, Globe, Receipt, Terminal, ArrowRight, ShieldCheck, Power, X } from 'lucide-react'
import { components } from '@shared/api/schema'

type ServerResponse = components['schemas']['Server']

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
  const navActions = [
    { id: 'nav-servers', title: 'Go to Virtual Servers & Compute', category: 'Navigation', icon: Server, action: () => { onNavigateTab('servers'); onClose(); } },
    { id: 'nav-terminal', title: 'Open Embedded SSH Shell', category: 'Navigation', icon: Terminal, action: () => { onNavigateTab('terminal'); onClose(); } },
    { id: 'nav-dns', title: 'Manage DNS Domains & Records', category: 'Navigation', icon: Globe, action: () => { onNavigateTab('dns'); onClose(); } },
    { id: 'nav-billing', title: 'View Balance, Data Usages & Invoices', category: 'Navigation', icon: Receipt, action: () => { onNavigateTab('billing'); onClose(); } }
  ]

  // Server Items
  const serverActions = servers.map((s) => ({
    id: `server-${s.id}`,
    title: `${s.name} (${s.networks?.v4?.[0]?.ip_address || 'No IP'})`,
    subtitle: `${s.region?.slug?.toUpperCase()} • ${s.status === 'active' ? '🟢 Running' : '🔴 Stopped'}`,
    category: 'Servers',
    icon: Server,
    action: () => {
      onSelectServer(s)
      onClose()
    }
  }))

  const allItems = [...navActions, ...serverActions]
  const filtered = allItems.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <Search className="w-4 h-4 text-sky-400 mr-3 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command, server name, IP, or navigation target..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded border border-slate-700 font-mono ml-2">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 space-y-1 overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">No matching commands or resources found.</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition ${
                    isSelected ? 'bg-sky-600/20 text-white border border-sky-500/30' : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-100">{item.title}</div>
                      {item.subtitle && <div className="text-[10px] text-slate-400">{item.subtitle}</div>}
                    </div>
                  </div>

                  <span className="text-[10px] font-medium text-slate-500 px-2 py-0.5 rounded bg-slate-800/80">
                    {item.category}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Navigate with</span>
            <kbd className="px-1 bg-slate-800 rounded border border-slate-700">↑</kbd>
            <kbd className="px-1 bg-slate-800 rounded border border-slate-700">↓</kbd>
            <span>Select with</span>
            <kbd className="px-1 bg-slate-800 rounded border border-slate-700">Enter</kbd>
          </div>
          <span>BLDesk Quick Action</span>
        </div>
      </div>
    </div>
  )
}
