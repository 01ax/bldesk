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

/**
 * What a notification is about, so the user can mute a category from the tray
 * menu. Omitted → 'general', which is never filtered.
 */
export type NotificationKind = 'general' | 'server-state' | 'action' | 'balance'

export interface SystemNotificationOptions {
  title: string
  body: string
  icon?: string
  kind?: NotificationKind
}

// --- Tray / menu bar ---

export interface TrayServer {
  id: number
  name: string
  status: string
  /** Primary public IPv4, when the server has one. */
  ip?: string
}

/** What the renderer knows about the fleet, pushed to main for the tray. */
export interface TrayFleetSummary {
  accountName?: string
  running: number
  off: number
  /** Provisioning, archived, or otherwise not simply on/off. */
  other: number
  /** Actions being tracked to completion right now. */
  inProgress: number
  /** Actions BinaryLane has paused on a question nobody has answered yet. */
  awaitingAnswer: number
  /** Invoices whose payment attempt failed and remain unpaid. */
  failedInvoices: number
  servers: TrayServer[]
  /** Available prepaid credit in AUD, when the balance has loaded. */
  availableCredit?: number
}

export interface TraySettings {
  launchAtLogin: boolean
  /** Closing the window hides to the tray instead of quitting. */
  closeToTray: boolean
  notifyServerState: boolean
  notifyActions: boolean
  notifyBalance: boolean
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
  /** false in dev / unpackaged desktop builds. */
  supported: boolean
  availableVersion?: string
  releaseNotes?: string
  /** 0-100 while downloading. */
  progress?: number
  error?: string
  lastCheckedAt?: string
  apkUrl?: string
}

/** A change-log entry as stored; the renderer's lib/changelog.ts owns the shape. */
export interface ChangeLogRecord {
  id: string
  at: string
  profileId: string
}

export type TemplateGetResult =
  | { ok: true; document: string }
  | { ok: false; code: 'missing' | 'too_large' | 'unreadable'; message: string; bytes?: number }

export interface IpcApi {
  // Vault & Auth
  getProfiles: () => Promise<Omit<AccountProfile, 'token'>[]>
  getActiveProfile: () => Promise<AccountProfile | null>
  saveProfile: (profile: { name: string; token: string; isDefault?: boolean; profileId?: string }) => Promise<{ success: boolean; profileId: string; updated?: boolean; error?: string }>
  deleteProfile: (profileId: string) => Promise<{ success: boolean }>
  setActiveProfile: (profileId: string) => Promise<{ success: boolean }>
  
  // Terminal & Console
  launchNativeTerminal: (options: TerminalLaunchOptions) => Promise<TerminalLaunchResult>
  openRescueConsole: (options: ConsoleWindowOptions) => Promise<{ success: boolean }>
  
  // SSH Keys & Local FS
  getLocalSshKeys: () => Promise<LocalSshKey[]>

  // System Notifications
  sendNotification: (options: SystemNotificationOptions) => Promise<void>

  // Local change log — see main/changelog.ts and renderer lib/changelog.ts
  changelogAppend: (entry: ChangeLogRecord) => Promise<void>
  changelogUpdate: (profileId: string, id: string, patch: Record<string, unknown>) => Promise<void>
  changelogList: (profileId: string, limit?: number) => Promise<any[]>
  changelogClear: (profileId: string) => Promise<void>

  // Device-wide cloud-init templates, stored as YAML documents.
  templatesList: () => Promise<string[]>
  templatesGet: (slug: string) => Promise<TemplateGetResult>
  templatesSave: (document: string, oldSlug?: string) => Promise<string>
  templatesRemove: (slug: string) => Promise<void>
  templatesReveal: (slug: string) => Promise<void>

  // Tray / menu bar — see main/tray.ts
  /** Push the current fleet picture; main rebuilds the tray tooltip and menu from it. */
  updateTray: (summary: TrayFleetSummary) => Promise<void>
  getTraySettings: () => Promise<TraySettings>
  
  // Window Controls
  /** 'darwin' | 'win32' | 'linux' in Electron; 'android' | 'web' from the mobile bridge. Decides whose window chrome is drawn. */
  platform: string
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  /** Fires on maximise / restore from any cause; returns an unsubscribe. */
  onWindowMaximized?: (listener: (maximized: boolean) => void) => () => void
  
  // Shell / Browser
  openExternal: (url: string) => Promise<void>

  // Auto-update
  getUpdaterState: () => Promise<UpdaterState>
  checkForUpdates: () => Promise<UpdaterState>
  installUpdate: () => Promise<void>
  setUpdateChannel: (channel: UpdateChannel) => Promise<UpdaterState>
  /** Subscribe to state changes; returns an unsubscribe function. */
  onUpdaterState: (listener: (state: UpdaterState) => void) => () => void

  // Deep links (bldesk://) — see shared/deeplink.ts for the URL grammar
  /** One-shot: a link that arrived before the renderer was listening (cold start). */
  getPendingDeepLink: () => Promise<string | null>
  /** Tell main the renderer is subscribed; flushes any queued link via onDeepLink. */
  deepLinkReady: () => Promise<void>
  /** Subscribe to links arriving while running; returns an unsubscribe function. */
  onDeepLink: (listener: (url: string) => void) => () => void
}

declare global {
  interface Window {
    bldeskApi: IpcApi
  }
}
