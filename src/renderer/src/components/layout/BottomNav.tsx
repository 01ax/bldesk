import React from 'react'
import { Server, Network, Layers, Archive, Menu } from 'lucide-react'
import { ActiveTab } from './Sidebar'

interface BottomNavProps {
  activeTab: ActiveTab
  onSelectTab: (tab: ActiveTab) => void
  onOpenDrawer: () => void
  serverCount?: number
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenDrawer,
  serverCount = 0
}) => {
  const mainTabs: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: 'servers', label: 'Servers', icon: Server, badge: serverCount > 0 ? serverCount : undefined },
    { id: 'vpcs', label: 'VPCs', icon: Network },
    { id: 'loadbalancers', label: 'Load Bal.', icon: Layers },
    { id: 'backups', label: 'Backups', icon: Archive }
  ]

  const isMoreActive = !mainTabs.some((t) => t.id === activeTab)

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 z-40 px-2 py-1.5 flex items-center justify-around select-none">
      {mainTabs.map((item) => {
        const Icon = item.icon
        const isActive = activeTab === item.id

        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition ${
              isActive ? 'text-sky-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
              {item.badge !== undefined && (
                <span className="absolute -top-1 -right-2.5 px-1 py-0.2 text-[9px] font-bold bg-sky-500 text-slate-950 rounded-full min-w-[14px] text-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        )
      })}

      {/* More Button to open full drawer */}
      <button
        onClick={onOpenDrawer}
        className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition ${
          isMoreActive ? 'text-sky-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Menu className={`w-5 h-5 ${isMoreActive ? 'text-sky-400' : 'text-slate-400'}`} />
        <span className="text-[10px] mt-0.5 tracking-tight">More</span>
      </button>
    </nav>
  )
}
