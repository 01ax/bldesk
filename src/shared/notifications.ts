import type { NotificationKind, NotificationSettingKey, TraySettings } from './ipc-types'

/**
 * Which notifications BLDesk may show. One gate for the desktop (main/tray.ts),
 * Android and the browser build (api/mobile-bridge.ts), so a muted kind is
 * dropped the same way everywhere. The words the user reads for each switch
 * live with the screens that show them (SettingsView, the tray menu).
 */

export const DEFAULT_TRAY_SETTINGS: TraySettings = {
  launchAtLogin: false,
  closeToTray: true,
  notificationsEnabled: true,
  notifyServerState: true,
  notifyActions: true,
  notifyBalance: true,
  notifyGeneral: true,
  notifyUpdates: true
}

/** Every kind a notification can carry, and the switch that decides whether that kind is shown. */
export const NOTIFICATION_SETTING: Record<NotificationKind, NotificationSettingKey> = {
  'server-state': 'notifyServerState',
  action: 'notifyActions',
  balance: 'notifyBalance',
  general: 'notifyGeneral',
  update: 'notifyUpdates'
}

/** The settings the renderer may change: the master switch and one per kind. */
export const NOTIFICATION_SETTING_KEYS: readonly ('notificationsEnabled' | NotificationSettingKey)[] = [
  'notificationsEnabled',
  ...Object.values(NOTIFICATION_SETTING)
]

/** Whether a notification of this kind may be shown under these settings. A notification sent without a kind is `general`. */
export function notificationAllowed(settings: TraySettings, kind: NotificationKind = 'general'): boolean {
  return settings.notificationsEnabled && settings[NOTIFICATION_SETTING[kind]]
}

/** Saved settings, read defensively: a missing or non-boolean value falls back to its default. */
export function normaliseTraySettings(raw: unknown): TraySettings {
  const out = { ...DEFAULT_TRAY_SETTINGS }
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  for (const key of Object.keys(DEFAULT_TRAY_SETTINGS) as Array<keyof TraySettings>) {
    if (typeof source[key] === 'boolean') out[key] = source[key] as boolean
  }
  return out
}
