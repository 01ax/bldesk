import type { HelpApi } from './help-api'

/**
 * How a saved token is held. `unencrypted` only after the user chose it on a
 * system with no working keyring; `unreadable` when it can no longer be
 * decrypted (keyring locked or replaced) and has to be entered again.
 */
export type TokenStatus = 'encrypted' | 'unencrypted' | 'unreadable'

export interface AccountProfile {
  id: string
  name: string
  /** Encrypted at rest with the OS keyring (desktop) or Android Keystore. '' when unreadable. */
  token: string
  tokenStatus?: TokenStatus
  email?: string
  isDefault?: boolean
  createdAt: string
}

export interface SaveProfileResult {
  success: boolean
  profileId: string
  updated?: boolean
  error?: string
  /** The keyring could not encrypt; the user may retry with `allowUnencrypted`. */
  errorCode?: 'encryption-unavailable'
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

export interface PtyOpenOptions extends TerminalLaunchOptions {
  serverId?: number
  serverName?: string
  cols: number
  rows: number
  /** Broadcast only: passed after the SSH destination, never to a local shell. */
  remoteCommand?: string
}

export interface PtySessionInfo {
  id: string
  serverId?: number
  serverName: string
  host: string
  username: string
  status: 'connecting' | 'live' | 'exited'
  exitCode?: number
  signal?: number
  broadcast?: boolean
}

export interface PtyApi {
  open: (options: PtyOpenOptions) => Promise<{ id: string }>
  write: (id: string, data: string) => Promise<void>
  resize: (id: string, cols: number, rows: number) => Promise<void>
  close: (id: string) => Promise<void>
  list: () => Promise<PtySessionInfo[]>
  onData: (cb: (id: string, chunk: string) => void) => () => void
  onExit: (cb: (id: string, code: number, signal?: number) => void) => () => void
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
 * What a notification is about, so the user can mute a category from Settings
 * or the tray menu. Omitted → 'general', which has its own switch like the rest.
 */
export type NotificationKind = 'general' | 'server-state' | 'action' | 'balance' | 'update'

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
  /** Master switch: off mutes every notification, whatever the categories below say. */
  notificationsEnabled: boolean
  notifyServerState: boolean
  notifyActions: boolean
  notifyBalance: boolean
  /** Confirmations of changes made in BLDesk, and anything else sent without a more specific kind. */
  notifyGeneral: boolean
  notifyUpdates: boolean
}

/** The per-category switches of TraySettings; see NOTIFICATION_SETTING in shared/notifications.ts. */
export type NotificationSettingKey = Extract<keyof TraySettings, `notify${string}`>

export interface LocalSshKey {
  name: string
  publicKey: string
  pubPath?: string
  privateKeyPath?: string
}

/** A key pair generated into ~/.ssh by the system ssh-keygen (#100). */
export type GenerateSshKeyPairResult =
  | { ok: true; name: string; publicKey: string; privateKeyPath: string }
  | { ok: false; code: 'invalid-name' | 'no-ssh-keygen' | 'failed'; message: string }

// --- Auto-update ---

export type UpdateChannel = 'stable' | 'beta'

export type UpdaterStatus =
  | 'idle' // nothing happening (or dev mode)
  | 'checking'
  | 'up-to-date'
  | 'available' // found, download starting
  | 'downloading'
  | 'ready' // downloaded; restart to install
  | 'installing' // Restart was chosen: the system asks for the password (Linux package), then the installer runs and the app restarts
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
  /** While `installing` on a Linux package: waiting for the password (BLDesk stays open), or closing for the install. */
  installPhase?: 'authorising' | 'installing'
  /** Why the last Restart did not install the update (prompt cancelled, checksum mismatch, installer failed). */
  installError?: string
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

/** Result of a TCP connect probe run from the user's machine (FEATURES.md #11). */
export interface TcpProbeResult {
  ok: boolean
  latencyMs?: number
  error?: 'timeout' | 'refused' | 'unreachable' | 'invalid-target' | 'other'
  detail?: string
}

export interface PingProbeResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

export interface TracerouteHop {
  hop: number
  host?: string
  latencyMs?: number
  timedOut: boolean
}

export interface IpcApi extends HelpApi {
  // Vault & Auth
  getProfiles: () => Promise<Omit<AccountProfile, 'token'>[]>
  getActiveProfile: () => Promise<AccountProfile | null>
  saveProfile: (profile: { name: string; token: string; isDefault?: boolean; profileId?: string; allowUnencrypted?: boolean }) => Promise<SaveProfileResult>
  deleteProfile: (profileId: string) => Promise<{ success: boolean }>
  setActiveProfile: (profileId: string) => Promise<{ success: boolean }>
  
  // Terminal & Console
  pty?: PtyApi
  launchNativeTerminal: (options: TerminalLaunchOptions) => Promise<TerminalLaunchResult>
  openRescueConsole: (options: ConsoleWindowOptions) => Promise<{ success: boolean; error?: string }>
  
  // SSH Keys & Local FS
  getLocalSshKeys: (selectedPaths?: string[]) => Promise<LocalSshKey[]>
  chooseSshKeyFile?: () => Promise<LocalSshKey | null>
  /** Desktop only: absent on Android, which has no native key generation. */
  generateSshKeyPair?: (request: { name: string; takenNames: string[] }) => Promise<GenerateSshKeyPairResult>
  /** Reveal a generated key in the file manager. Only paths inside ~/.ssh are accepted. */
  showSshKeyInFolder?: (privateKeyPath: string) => Promise<void>

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
  /**
   * Only the notification switches can be set from the renderer; returns the settings in force. Rejects when the change
   * could not be saved on the device: it still applies until BLDesk is closed.
   */
  setTraySetting: (key: 'notificationsEnabled' | NotificationSettingKey, value: boolean) => Promise<TraySettings>
  /**
   * Fires when a setting changes from anywhere (the tray menu included); returns an unsubscribe. `unsaved` is true
   * when a change made from the tray menu could not be saved: that has no caller to reject to. A change made through
   * setTraySetting says so by rejecting instead, so `unsaved` is never true for it.
   */
  onTraySettingsChanged?: (listener: (settings: TraySettings, unsaved: boolean) => void) => () => void
  
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

  /*
   * Reachability probes. Optional because they only exist in Electron - the
   * Android build has no raw sockets and no child_process, so the renderer
   * feature-detects these and hides the UI rather than shipping a button that
   * cannot work.
   */
  probeTcp?: (host: string, port: number, timeoutMs?: number) => Promise<TcpProbeResult>
  probePing?: (host: string, timeoutMs?: number) => Promise<PingProbeResult>
  traceroute?: (host: string, maxHops?: number) => Promise<TracerouteHop[]>
  /** Addresses the main process will accept probes for; set from the server list. */
  setProbeTargets?: (ips: string[]) => Promise<void>

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
