import { app, BrowserWindow, Menu, MenuItemConstructorOptions, Notification, Tray, clipboard, nativeImage, NativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { writeOwnerFileAtomic } from './ownerFiles'
import { NotificationSettingKey, SystemNotificationOptions, TrayFleetSummary, TraySettings } from '../shared/ipc-types'
import { DEFAULT_TRAY_SETTINGS, normaliseTraySettings, notificationAllowed } from '../shared/notifications'
import { DeepLinkManager } from './deeplink'
import { formatDeepLink } from '../shared/deeplink'
import { UpdaterManager } from './updater'

/**
 * The tray / menu-bar item (FEATURES.md #3).
 *
 * The renderer owns the data — it already polls the server list every 15 s and
 * tracks actions to completion — and pushes a `TrayFleetSummary` here whenever
 * the picture changes. Main turns that into a tooltip, a menu with counts and a
 * Quick SSH submenu, and (on macOS) a title next to the icon while actions run.
 *
 * Settings live in `<userData>/tray.json`. The menu edits them, and so does the
 * Settings view in the renderer (through `setSetting`); `onSettingsChanged`
 * tells the renderer when the menu changed one. Notification categories are
 * filtered here too: every notification the app sends passes through
 * `notify()`, and a muted kind is dropped before it reaches the OS.
 */

const SETTINGS_FILE = 'tray.json'

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function readSettings(): TraySettings {
  try {
    const p = settingsPath()
    if (existsSync(p)) {
      return normaliseTraySettings(JSON.parse(readFileSync(p, 'utf8')))
    }
  } catch (err) {
    console.warn('[Tray] Failed to read settings:', err)
  }
  return { ...DEFAULT_TRAY_SETTINGS }
}

/** Whether the settings were written. A failure is logged here and reported to the user by setSetting's callers. */
function writeSettings(s: TraySettings): boolean {
  try {
    writeOwnerFileAtomic(settingsPath(), JSON.stringify(s, null, 2))
    return true
  } catch (err) {
    console.warn('[Tray] Failed to write settings:', err)
    return false
  }
}

// The tray menu's wording for each switch. A Record, so a new category cannot ship without one.
const NOTIFY_MENU_LABEL: Record<NotificationSettingKey, string> = {
  notifyServerState: 'Notify when a server changes state',
  notifyActions: 'Notify when an action finishes or fails',
  notifyBalance: 'Notify about billing (low credit, failed payments)',
  notifyGeneral: 'Notify about changes you make in BLDesk',
  notifyUpdates: 'Notify when a BLDesk update is ready'
}

export class TrayManager {
  private static tray: Tray | null = null
  private static settings: TraySettings = { ...DEFAULT_TRAY_SETTINGS }
  private static summary: TrayFleetSummary | null = null
  private static getWindow: () => BrowserWindow | null = () => null
  private static showWindow: () => void = () => {}
  private static onSettingsChanged: (settings: TraySettings, unsaved: boolean) => void = () => {}
  private static hiddenToTrayNoticeShown = false

  static init(opts: {
    icon: NativeImage
    getWindow: () => BrowserWindow | null
    showWindow: () => void
    onSettingsChanged?: (settings: TraySettings, unsaved: boolean) => void
  }): void {
    this.getWindow = opts.getWindow
    this.showWindow = opts.showWindow
    this.onSettingsChanged = opts.onSettingsChanged ?? (() => {})
    this.settings = readSettings()
    // Re-assert the login item only when it is on: registering an unpackaged
    // dev binary fails ("Operation not permitted" on macOS), and there is
    // nothing to reconcile when the user never asked for it.
    if (this.settings.launchAtLogin) this.applyLoginItem()

    try {
      this.tray = new Tray(opts.icon)
      this.tray.setToolTip('BLDesk - BinaryLane Desktop')
      this.tray.on('double-click', () => this.showWindow())
      // Windows: single click opens; macOS/Linux show the menu on click.
      if (process.platform === 'win32') this.tray.on('click', () => this.showWindow())
      this.rebuild()
    } catch (err) {
      console.warn('[Tray] Failed to initialize tray:', err)
      this.tray = null
    }
  }

  static getSettings(): TraySettings {
    return { ...this.settings }
  }

  /**
   * The change applies at once, saved or not: the settings in force are the ones in memory. `saved` says whether they
   * reached tray.json. A change from the menu has nobody to hand that to, so the renderer is told through
   * `onSettingsChanged`; a caller from the renderer gets it in the result and reports it itself.
   */
  static setSetting<K extends keyof TraySettings>(
    key: K,
    value: TraySettings[K],
    source: 'menu' | 'renderer' = 'menu'
  ): { settings: TraySettings; saved: boolean } {
    this.settings = { ...this.settings, [key]: value }
    const saved = writeSettings(this.settings)
    if (key === 'launchAtLogin') this.applyLoginItem()
    this.rebuild()
    this.onSettingsChanged(this.getSettings(), source === 'menu' && !saved)
    return { settings: this.getSettings(), saved }
  }

  /** Called by the renderer whenever the fleet picture changes. */
  static update(summary: TrayFleetSummary): void {
    this.summary = summary
    this.rebuild()
  }

  /** Renderer is gone (profile switch mid-flight, window closed): show a neutral state. */
  static clear(): void {
    this.summary = null
    this.rebuild()
  }

  /**
   * The one place app notifications go through. Returns whether it was shown,
   * so callers can fall back to in-app feedback when a kind is muted.
   */
  static notify(options: SystemNotificationOptions): boolean {
    if (!notificationAllowed(this.settings, options.kind)) return false
    if (!Notification.isSupported()) return false
    const n = new Notification({ title: options.title, body: options.body, silent: false })
    // Clicking a notification is a request to look, so bring the window back.
    n.on('click', () => this.showWindow())
    n.show()
    return true
  }

  /** Whether a window close should hide to the tray rather than quit. */
  static shouldHideOnClose(): boolean {
    return this.settings.closeToTray && this.tray !== null
  }

  /** The window was just hidden instead of closed; say so the first time. */
  static onHiddenToTray(): void {
    if (this.hiddenToTrayNoticeShown) return
    this.hiddenToTrayNoticeShown = true
    this.notify({
      title: 'BLDesk is still running',
      body:
        process.platform === 'darwin'
          ? 'Find it in the menu bar. Use Quit from there to exit fully.'
          : 'Find it in the system tray. Use Quit from there to exit fully.'
    })
  }

  static dispose(): void {
    this.tray?.destroy()
    this.tray = null
  }

  // -------------------------------------------------------------------------

  private static applyLoginItem(): void {
    // Electron implements this on macOS and Windows only; Linux autostart is a
    // .desktop file the user manages, so the menu item is hidden there.
    if (process.platform === 'linux') return
    if (!app.isPackaged) {
      console.log('[Tray] Not packaged; launch-at-login not applied (dev mode).')
      return
    }
    try {
      // `openAsHidden` is gone from Electron's API; it was macOS-only and macOS
      // 13+ already ignored it, so a login launch there shows the window as before.
      app.setLoginItemSettings({ openAtLogin: this.settings.launchAtLogin })
    } catch (err) {
      console.warn('[Tray] Failed to set login item:', err)
    }
  }

  private static rebuild(): void {
    if (!this.tray) return
    const s = this.summary

    // Tooltip: the counts at a glance.
    const parts: string[] = []
    if (s) {
      parts.push(`${s.running} running`)
      if (s.off) parts.push(`${s.off} off`)
      if (s.other) parts.push(`${s.other} other`)
      if (s.inProgress) parts.push(`${s.inProgress} in progress`)
      if (s.awaitingAnswer) parts.push(`${s.awaitingAnswer} awaiting your answer`)
      if (s.failedInvoices) parts.push(`${s.failedInvoices} failed payment${s.failedInvoices === 1 ? '' : 's'}`)
    }
    this.tray.setToolTip(s ? `BLDesk — ${parts.join(', ')}` : 'BLDesk - BinaryLane Desktop')

    // macOS shows text beside the icon. Only while something needs you —
    // a permanent number in the menu bar is noise, a transient one is a signal.
    // "!" outranks the spinner: a paused action or a failed payment is a thing
    // to act on, progress is just a thing to know.
    if (process.platform === 'darwin') {
      const needsYou = (s?.awaitingAnswer ?? 0) + (s?.failedInvoices ?? 0)
      const title = needsYou ? `!${needsYou}` : s?.inProgress ? `↻${s.inProgress}` : ''
      this.tray.setTitle(title, { fontType: 'monospacedDigit' })
    }

    const template: MenuItemConstructorOptions[] = []

    template.push({ label: s?.accountName ? `BLDesk — ${s.accountName}` : 'BLDesk - BinaryLane Cloud', enabled: false })
    if (s) {
      template.push({ label: `● ${s.running} running · ○ ${s.off} off${s.other ? ` · ◌ ${s.other} other` : ''}`, enabled: false })
      if (s.inProgress) template.push({ label: `↻ ${s.inProgress} action${s.inProgress === 1 ? '' : 's'} in progress`, enabled: false })
      if (s.awaitingAnswer) {
        template.push({
          label: `? ${s.awaitingAnswer} action${s.awaitingAnswer === 1 ? '' : 's'} need${s.awaitingAnswer === 1 ? 's' : ''} your answer…`,
          click: () => this.showWindow()
        })
      }
      if (s.failedInvoices) {
        template.push({
          label: `⚠ ${s.failedInvoices} invoice payment${s.failedInvoices === 1 ? '' : 's'} failed…`,
          click: () => {
            this.showWindow()
            DeepLinkManager.dispatch(formatDeepLink({ kind: 'tab', tab: 'billing' }))
          }
        })
      }
      if (typeof s.availableCredit === 'number') {
        template.push({ label: `Credit: $${s.availableCredit.toFixed(2)} AUD`, enabled: false })
      }
    } else {
      template.push({ label: 'Not signed in', enabled: false })
    }

    template.push({ type: 'separator' })
    template.push({ label: 'Open Dashboard', click: () => this.showWindow() })

    // Servers: one submenu each, running ones first. Read-only conveniences
    // only — anything that changes a server belongs behind the window's review
    // step, not a menu click with no preview.
    const all = s?.servers ?? []
    if (all.length > 0) {
      const sorted = [...all].sort((a, b) => {
        if (a.status === b.status) return a.name.localeCompare(b.name)
        return a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0
      })
      template.push({
        label: 'Servers',
        submenu: sorted.map<MenuItemConstructorOptions>((srv) => ({
          label: `${srv.status === 'active' ? '●' : srv.status === 'off' ? '○' : '◌'} ${srv.name}`,
          sublabel: srv.ip,
          submenu: [
            {
              label: 'Open in BLDesk',
              click: () => {
                this.showWindow()
                DeepLinkManager.dispatch(formatDeepLink({ kind: 'server', serverId: srv.id }))
              }
            },
            {
              label: srv.ip ? `Copy IP  ${srv.ip}` : 'Copy IP',
              enabled: !!srv.ip,
              click: () => clipboard.writeText(srv.ip!)
            },
            {
              label: 'SSH as root',
              enabled: srv.status === 'active',
              click: () => {
                this.showWindow()
                DeepLinkManager.dispatch(formatDeepLink({ kind: 'ssh', serverId: srv.id }))
              }
            }
          ]
        }))
      })
    }

    template.push({ type: 'separator' })

    const settingsItems: MenuItemConstructorOptions[] = []
    if (process.platform !== 'linux') {
      settingsItems.push({
        label: 'Launch at login',
        type: 'checkbox',
        checked: this.settings.launchAtLogin,
        click: (item) => this.setSetting('launchAtLogin', item.checked)
      })
    }
    settingsItems.push(
      {
        label: 'Keep running in tray when window is closed',
        type: 'checkbox',
        checked: this.settings.closeToTray,
        click: (item) => this.setSetting('closeToTray', item.checked)
      },
      { type: 'separator' },
      {
        label: 'Show notifications',
        type: 'checkbox',
        checked: this.settings.notificationsEnabled,
        click: (item) => this.setSetting('notificationsEnabled', item.checked)
      },
      // Each kept as set while the master switch is off, so turning it back on restores them.
      ...(Object.keys(NOTIFY_MENU_LABEL) as NotificationSettingKey[]).map<MenuItemConstructorOptions>((key) => ({
        label: NOTIFY_MENU_LABEL[key],
        type: 'checkbox',
        enabled: this.settings.notificationsEnabled,
        checked: this.settings[key],
        click: (item) => this.setSetting(key, item.checked)
      })),
      { type: 'separator' },
      {
        label: 'All settings…',
        click: () => {
          this.showWindow()
          DeepLinkManager.dispatch(formatDeepLink({ kind: 'tab', tab: 'settings' }))
        }
      }
    )
    template.push({ label: 'Settings', submenu: settingsItems })

    template.push({
      label: 'Check for updates',
      enabled: app.isPackaged,
      click: () => void UpdaterManager.check()
    })

    template.push({ type: 'separator' })
    template.push({ label: 'Quit BLDesk', click: () => app.quit() })

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }
}

/** Convenience for callers that only have a data URL fallback. */
export function trayImageFromDataUrl(dataUrl: string): NativeImage {
  return nativeImage.createFromDataURL(dataUrl)
}
