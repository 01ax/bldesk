import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Server, Search, Key, ShieldCheck } from 'lucide-react'
import { AccountProfile } from '@shared/ipc-types'

interface TitleBarProps {
  activeProfile: AccountProfile | null
  profiles: Omit<AccountProfile, 'token'>[]
  onSwitchProfile: (id: string) => void
  onOpenAuth: () => void
  onOpenCommandPalette: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeProfile,
  profiles,
  onSwitchProfile,
  onOpenAuth,
  onOpenCommandPalette
}) => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.bldeskApi.isMaximized().then(setIsMaximized)
  }, [])

  const handleMinimize = () => window.bldeskApi.minimizeWindow()
  const handleMaximize = async () => {
    await window.bldeskApi.maximizeWindow()
    const max = await window.bldeskApi.isMaximized()
    setIsMaximized(max)
  }
  const handleClose = () => window.bldeskApi.closeWindow()

  return (
    <div className="titlebar-drag-region h-11 w-full bg-slate-950/90 backdrop-blur border-b border-slate-800 flex items-center justify-between px-3 select-none z-50 flex-shrink-0">
      {/* Brand & Fleet Info */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 font-bold tracking-wide text-sky-400 text-sm">
          <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <span>BL<span className="text-white">Desk</span></span>
        </div>
        <span className="text-xs text-slate-500 border-l border-slate-800 pl-2">BinaryLane Cloud</span>
      </div>

      {/* Global Command Palette Trigger */}
      <div className="titlebar-no-drag flex items-center">
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-3 py-1 text-xs text-slate-400 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg transition shadow-inner"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Quick search servers, DNS, actions...</span>
          <kbd className="ml-3 px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded border border-slate-700 font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Profile & Window Controls */}
      <div className="titlebar-no-drag flex items-center gap-2">
        {/* Profile Switcher / Auth Button */}
        {activeProfile ? (
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={activeProfile.id}
              onChange={(e) => onSwitchProfile(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium outline-none cursor-pointer pr-1"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={onOpenAuth}
              title="Add or Manage Profiles"
              className="text-slate-400 hover:text-slate-200 p-0.5 transition"
            >
              <Key className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Connect Account</span>
          </button>
        )}

        {/* Window Action Controls (Windows style) */}
        <div className="flex items-center ml-2 border-l border-slate-800 pl-2">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600/80 rounded transition"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
