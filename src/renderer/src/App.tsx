import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar, ActiveTab } from './components/layout/Sidebar'
import { ServerList } from './components/servers/ServerList'
import { ServerDetails } from './components/servers/ServerDetails'
import { EmbeddedTerminal } from './components/terminal/EmbeddedTerminal'
import { DnsManager } from './components/dns/DnsManager'
import { BillingOverview } from './components/billing/BillingOverview'
import { VpcManager } from './components/vpcs/VpcManager'
import { SshKeysManager } from './components/keys/SshKeysManager'
import { FirewallManager } from './components/firewall/FirewallManager'
import { LoadBalancerManager } from './components/loadbalancers/LoadBalancerManager'
import { AuthModal } from './components/auth/AuthModal'
import { CommandPalette } from './components/palette/CommandPalette'
import { createBinaryLaneClient, BinaryLaneClient } from './api/client'
import { useServers } from './api/queries'
import { AccountProfile } from '@shared/ipc-types'
import { components } from '@shared/api/schema'

type ServerResponse = components['schemas']['Server']

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000
    }
  }
})

function MainDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('servers')
  const [profiles, setProfiles] = useState<Omit<AccountProfile, 'token'>[]>([])
  const [activeProfile, setActiveProfile] = useState<AccountProfile | null>(null)
  const [client, setClient] = useState<BinaryLaneClient | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [selectedServer, setSelectedServer] = useState<ServerResponse | null>(null)
  const [terminalHost, setTerminalHost] = useState('')

  // Load vault profiles on mount
  const refreshProfiles = async () => {
    const pList = await window.bldeskApi.getProfiles()
    const active = await window.bldeskApi.getActiveProfile()
    setProfiles(pList)
    setActiveProfile(active)

    if (active && active.token) {
      setClient(createBinaryLaneClient(active.token))
    } else {
      setClient(null)
      if (pList.length === 0) {
        setIsAuthOpen(true)
      }
    }
  }

  useEffect(() => {
    refreshProfiles()
  }, [])

  const handleSwitchProfile = async (profileId: string) => {
    await window.bldeskApi.setActiveProfile(profileId)
    await refreshProfiles()
  }

  const { data: servers = [], isLoading: isLoadingServers } = useServers(client)

  const handleOpenTerminalForIp = (ip: string) => {
    setTerminalHost(ip)
    setActiveTab('terminal')
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Frameless Custom Titlebar */}
      <TitleBar
        activeProfile={activeProfile}
        profiles={profiles}
        onSwitchProfile={handleSwitchProfile}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenCommandPalette={() => setIsPaletteOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setSelectedServer(null)
            setActiveTab(tab)
          }}
          serverCount={servers.length}
        />

        {/* Dynamic Center Viewport */}
        <main className="flex-1 overflow-hidden bg-slate-950 relative">
          {activeTab === 'servers' && (
            selectedServer ? (
              <ServerDetails
                server={selectedServer}
                client={client}
                onBack={() => setSelectedServer(null)}
                onOpenTerminal={handleOpenTerminalForIp}
              />
            ) : (
              <ServerList
                servers={servers}
                isLoading={isLoadingServers}
                client={client}
                onSelectServer={setSelectedServer}
                onOpenTerminal={handleOpenTerminalForIp}
              />
            )
          )}

          {activeTab === 'terminal' && (
            <EmbeddedTerminal
              initialHost={terminalHost}
              onClose={() => setActiveTab('servers')}
            />
          )}

          {activeTab === 'vpcs' && (
            <VpcManager
              client={client}
              onSelectServer={(s) => {
                setSelectedServer(s)
                setActiveTab('servers')
              }}
            />
          )}

          {activeTab === 'dns' && <DnsManager client={client} />}

          {activeTab === 'keys' && <SshKeysManager client={client} />}

          {activeTab === 'firewall' && <FirewallManager client={client} />}

          {activeTab === 'loadbalancers' && (
            <LoadBalancerManager
              client={client}
              onSelectServer={(s) => {
                setSelectedServer(s)
                setActiveTab('servers')
              }}
            />
          )}

          {activeTab === 'billing' && <BillingOverview client={client} />}

          {activeTab === 'backups' && (
            <div className="h-full flex flex-col p-6 space-y-4">
              <h1 className="text-xl font-bold text-white capitalize">{activeTab} Manager</h1>
              <p className="text-xs text-slate-400">
                Manage your BinaryLane {activeTab} directly with full API synchronization.
              </p>
              {servers.length > 0 && selectedServer === null && (
                <div className="text-xs text-slate-500 p-8 bg-slate-900/30 rounded-xl border border-slate-800 text-center">
                  Select a server from the Compute tab to configure instance-specific {activeTab}.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Auth & Profile Vault Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        profiles={profiles}
        activeProfile={activeProfile}
        onProfileAddedOrUpdated={refreshProfiles}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        servers={servers}
        onSelectServer={(s) => {
          setSelectedServer(s)
          setActiveTab('servers')
        }}
        onNavigateTab={(tab) => {
          setSelectedServer(null)
          setActiveTab(tab)
        }}
      />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainDashboard />
    </QueryClientProvider>
  )
}
