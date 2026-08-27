import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Terminal as TermIcon, Play, RefreshCw, Key } from 'lucide-react'
import { LocalSshKey } from '@shared/ipc-types'

interface EmbeddedTerminalProps {
  initialHost?: string
  onClose?: () => void
}

export const EmbeddedTerminal: React.FC<EmbeddedTerminalProps> = ({ initialHost = '' }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermInstance = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [hostInput, setHostInput] = useState(initialHost)
  const [username, setUsername] = useState('root')
  const [selectedKeyPath, setSelectedKeyPath] = useState<string>('')
  const [localKeys, setLocalKeys] = useState<LocalSshKey[]>([])

  useEffect(() => {
    // Discover available local SSH keys
    window.bldeskApi.getLocalSshKeys().then((keys) => {
      setLocalKeys(keys)
      // If there are keys with privateKeyPath, default to the first one
      const defaultKey = keys.find((k) => k.privateKeyPath)
      if (defaultKey?.privateKeyPath) {
        setSelectedKeyPath(defaultKey.privateKeyPath)
      }
    })

    if (!terminalRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#020617', // slate-950
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        selectionBackground: '#0369a1'
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    term.writeln('\x1b[1;34m╔══════════════════════════════════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[1;34m║\x1b[0m   \x1b[1;36mBLDesk Embedded SSH / Native Console Terminal\x1b[0m              \x1b[1;34m║\x1b[0m')
    term.writeln('\x1b[1;34m╚══════════════════════════════════════════════════════════════╝\x1b[0m')
    term.writeln('\x1b[90mSelect an SSH key, enter target host, and click Connect to launch.\x1b[0m\r\n')

    xtermInstance.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [])

  const handleConnect = () => {
    if (!hostInput.trim() || !xtermInstance.current) return
    const term = xtermInstance.current
    const keyLabel = localKeys.find((k) => k.privateKeyPath === selectedKeyPath)?.name || 'Default'
    
    term.writeln(`\r\n\x1b[33mConnecting to ${username}@${hostInput} (Key: ${keyLabel})...\x1b[0m`)

    // Launch native terminal with specified key
    window.bldeskApi.launchNativeTerminal({
      host: hostInput,
      username,
      privateKeyPath: selectedKeyPath || undefined
    })
    term.writeln(`\x1b[32m[OK] Spawned native SSH session with key "${keyLabel}".\x1b[0m`)
    term.writeln(`\x1b[90mTip: Native Terminal session is running in your active OS console.\x1b[0m\r\n`)
  }

  const handleClear = () => {
    xtermInstance.current?.clear()
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 p-6 space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <TermIcon className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white">Terminal Session</h2>
            <p className="text-[10px] text-slate-400">Integrated shell & direct SSH connector</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* SSH Key Picker */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 border border-slate-800 rounded-lg">
            <Key className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <select
              value={selectedKeyPath}
              onChange={(e) => setSelectedKeyPath(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[140px]"
            >
              <option value="" className="bg-slate-900 text-slate-400">Default Key (~/.ssh/id_*)</option>
              {localKeys.map((k) => (
                <option key={k.name} value={k.privateKeyPath || ''} className="bg-slate-900 text-white">
                  {k.name} {k.privateKeyPath ? '🔑' : '(pub only)'}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="User (root)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-20 px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500"
          />
          <input
            type="text"
            placeholder="Host / IP Address"
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            className="w-40 px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={handleConnect}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Connect</span>
          </button>
          <button
            onClick={handleClear}
            className="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            title="Clear Terminal"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-hidden shadow-inner">
        <div ref={terminalRef} className="h-full w-full"></div>
      </div>
    </div>
  )
}
