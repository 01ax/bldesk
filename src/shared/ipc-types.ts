export interface AccountProfile {
  id: string
  name: string
  token: string // stored encrypted in safeStorage
  email?: string
  isDefault?: boolean
  createdAt: string
}

export interface StoredVaultData {
  activeProfileId: string | null
  profiles: AccountProfile[]
}

export interface TerminalLaunchOptions {
  host: string
  username?: string
  port?: number
  privateKeyPath?: string
}

export interface TerminalLaunchResult {
  success: boolean
  /** Why the launch failed — already human-readable. */
  error?: string
  /** Which emulator was used (e.g. "konsole", "Terminal.app"). */
  terminal?: string
  /** The ssh command line that was (or would have been) run — for clipboard fallback. */
  command?: string
}

export interface ConsoleWindowOptions {
  serverId: number
  serverName: string
  url: string
  width?: number
  height?: number
}

export interface SystemNotificationOptions {
  title: string
  body: string
  icon?: string
}

export interface LocalSshKey {
  name: string
  publicKey: string
  pubPath?: string
  privateKeyPath?: string
}

// --- Auto-update ---

export type UpdateChannel = 'stable' | 'beta'

export type UpdaterStatus =
  | 'idle' // nothing happening (or dev mode)
  | 'checking'
  | 'up-to-date'
  | 'available' // found, download starting
  | 'downloading'
  | 'ready' // downloaded; restart to install
  | 'check-failed' // feed unreachable / no manifest published; version is unknown, not confirmed current
  | 'error'

export interface UpdaterState {
  status: UpdaterStatus
  currentVersion: string
  channel: UpdateChannel
  /** false in dev / unpackaged builds and on mobile. */
  supported: boolean
  availableVersion?: string
  releaseNotes?: string
  /** 0-100 while downloading. */
  progress?: number
  error?: string
  lastCheckedAt?: string
}

export interface IpcApi {
  // Vault & Auth
  getProfiles: () => Promise<Omit<AccountProfile, 'token'>[]>
  getActiveProfile: () => Promise<AccountProfile | null>
  saveProfile: (profile: { name: string; token: string; isDefault?: boolean }) => Promise<{ success: boolean; profileId: string; error?: string }>
  deleteProfile: (profileId: string) => Promise<{ success: boolean }>
  setActiveProfile: (profileId: string) => Promise<{ success: boolean }>
  
  // Terminal & Console
  launchNativeTerminal: (options: TerminalLaunchOptions) => Promise<TerminalLaunchResult>
  openRescueConsole: (options: ConsoleWindowOptions) => Promise<{ success: boolean }>
  
  // SSH Keys & Local FS
  getLocalSshKeys: () => Promise<LocalSshKey[]>

  // System Notifications
  sendNotification: (options: SystemNotificationOptions) => Promise<void>
  
  // Window Controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  
  // Shell / Browser
  openExternal: (url: string) => Promise<void>

  // Auto-update
  getUpdaterState: () => Promise<UpdaterState>
  checkForUpdates: () => Promise<UpdaterState>
  installUpdate: () => Promise<void>
  setUpdateChannel: (channel: UpdateChannel) => Promise<UpdaterState>
  /** Subscribe to state changes; returns an unsubscribe function. */
  onUpdaterState: (listener: (state: UpdaterState) => void) => () => void
}

declare global {
  interface Window {
    bldeskApi: IpcApi
  }
}
