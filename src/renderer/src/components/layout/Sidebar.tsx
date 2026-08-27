import React from 'react'
import {
  Server,
  Network,
  Shield,
  Layers,
  Globe,
  Archive,
  Key,
  Receipt,
  ExternalLink,
  Terminal,
  Activity
} from 'lucide-react'

export type ActiveTab =
  | 'servers'
  | 'vpcs'
  | 'firewall'
  | 'loadbalancers'
  | 'dns'
  | 'backups'
  | 'keys'
  | 'billing'
  | 'terminal'

interface SidebarProps {
  activeTab: ActiveTab
  onSelectTab: (tab: ActiveTab) => void
  serverCount?: number
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, serverCount = 0 }) => {
  const menuItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: number | string }[] = [
    { id: 'servers', label: 'Servers & Compute', icon: Server, badge: serverCount > 0 ? serverCount : undefined },
    { id: 'terminal', label: 'Embedded Shell', icon: Terminal },
    { id: 'vpcs', label: 'VPC Networks', icon: Network },
    { id: 'firewall', label: 'Firewall Rules', icon: Shield },
    { id: 'loadbalancers', label: 'Load Balancers', icon: Layers },
    { id: 'dns', label: 'DNS & Domains', icon: Globe },
    { id: 'backups', label: 'Backups & Snapshots', icon: Archive },
    { id: 'keys', label: 'SSH Keys', icon: Key },
    { id: 'billing', label: 'Usage & Invoices', icon: Receipt }
  ]

  const handleOpenMpanel = () => {
    window.bldeskApi.openExternal('https://home.binarylane.com.au/mpanel')
  }

  return (
    <aside className="w-60 bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between select-none flex-shrink-0">
      {/* Navigation Links */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Cloud Resources
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${
                  isActive ? 'bg-sky-500/30 text-sky-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Footer / External Links */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 rounded-lg border border-slate-800/60 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>API Online</span>
          </div>
          <Activity className="w-3.5 h-3.5 text-slate-500" />
        </div>

        <button
          onClick={handleOpenMpanel}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition border border-slate-800/60"
        >
          <span>Open mPanel Web</span>
          <ExternalLink className="w-3 h-3 text-slate-500" />
        </button>
      </div>
    </aside>
  )
}
