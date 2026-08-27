import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar, ActiveTab } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { ServerList } from './components/servers/ServerList'
import { ServerDetails } from './components/servers/ServerDetails'
import { AuthModal } from './components/auth/AuthModal'
import { CommandPalette } from './components/palette/CommandPalette'
import { EmbeddedTerminal } from './components/terminal/EmbeddedTerminal'
import { VpcManager } from './components/vpcs/VpcManager'
import { DnsManager } from './components/dns/DnsManager'
import { SshKeysManager } from './components/keys/SshKeysManager'
import { FirewallManager } from './components/firewall/FirewallManager'
import { LoadBalancerManager } from './components/loadbalancers/LoadBalancerManager'
import { BackupManager } from './components/backups/BackupManager'
import { BillingOverview } from './components/billing/BillingOverview'
import { useServers } from './api/queries'
import { createBinaryLaneClient } from './api/client'
import { AccountProfile } from '@shared/ipc-types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30s freshness
      refetchOnWindowFocus: true,
      retry: 2
    }
  }
})

function MainDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('servers')
  const [selectedServer, setSelectedServer] = useState<any | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [profiles, setProfiles] = useState<Omit<AccountProfile, 'token'>[]>([])
  const [activeProfile, setActiveProfile] = useState<AccountProfile | null>(null)
  const [terminalHost, setTerminalHost] = useState<string | undefined>(undefined)

  const refreshProfiles = async () => {
    if (!window.bldeskApi) return
    const pList = await window.bldeskApi.getProfiles()
    const active = await window.bldeskApi.getActiveProfile()
    setProfiles(pList)
    setActiveProfile(active)

    if (pList.length === 0) {
      setIsAuthOpen(true)
    }
  }

  useEffect(() => {
    refreshProfiles()
  }, [])

  // Create API Client with Active Profile Token
  const client = React.useMemo(() => {
    return createBinaryLaneClient(activeProfile?.token || '')
  }, [activeProfile?.token])

  // Queries
  const { data: servers = [], isLoading: isLoadingServers } = useServers(client)

  const handleSwitchProfile = async (profileId: string) => {
    if (!window.bldeskApi) return
    await window.bldeskApi.setActiveProfile(profileId)
    await refreshProfiles()
    queryClient.invalidateQueries()
  }

  const handleOpenTerminalForIp = (ip: string) => {
    setTerminalHost(ip)
    setActiveTab('terminal')
  }

  const handleSelectTab = (tab: ActiveTab) => {
    setSelectedServer(null)
    setActiveTab(tab)
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
        onToggleMobileDrawer={() => setIsMobileDrawerOpen((prev) => !prev)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Navigation Sidebar (Desktop + Mobile Drawer) */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          serverCount={servers.length}
          isMobileDrawerOpen={isMobileDrawerOpen}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
        />

        {/* Dynamic Center Viewport */}
        <main className="flex-1 overflow-hidden bg-slate-950 relative pb-14 md:pb-0">
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

          {activeTab === 'backups' && <BackupManager client={client} />}

          {activeTab === 'billing' && <BillingOverview client={client} />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenDrawer={() => setIsMobileDrawerOpen(true)}
        serverCount={servers.length}
      />

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
