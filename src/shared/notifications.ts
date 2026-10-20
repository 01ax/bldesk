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

// ---------------------------------------------------------------------------
// Keeping the settings on Android and in the browser build. The desktop keeps them in tray.json (main/tray.ts).

/** One place a value can be kept. `get` gives null when nothing is stored there. */
export interface SettingsStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export const NOTIFICATION_SETTING_UNSAVED =
  'BLDesk could not save this setting on the device. It applies until BLDesk is closed, then goes back to what was saved.'

/**
 * The settings in force, saved to `primary` (app preferences) and, when that fails, to `fallback` (localStorage).
 *
 * - The settings in force are held in memory and `get` reads them, so a switch takes effect at once and a failed save
 *   cannot leave the gate disagreeing with what the screen shows.
 * - Changes apply in the order they were made, each on top of the last, and saves run one at a time. Each save writes
 *   everything changed so far, so two changes made together cannot overwrite each other.
 * - `fallback` holds a value only while `primary` could not be written, so when it has one it is the newer copy; a
 *   successful save to `primary` clears it.
 * - A change that could not be saved anywhere still applies, and `set` then rejects with NOTIFICATION_SETTING_UNSAVED.
 */
export function createNotificationSettingsStore(primary: SettingsStorage, fallback: SettingsStorage, key: string) {
  let inForce: Promise<TraySettings> | null = null
  let saves: Promise<unknown> = Promise.resolve()

  const stored = async (from: SettingsStorage): Promise<string | null> => {
    try {
      return await from.get(key)
    } catch {
      return null
    }
  }
  const load = async (): Promise<TraySettings> => {
    const raw = (await stored(fallback)) ?? (await stored(primary))
    try {
      return normaliseTraySettings(raw ? JSON.parse(raw) : null)
    } catch {
      return normaliseTraySettings(null) // unreadable: every notification stays on, as it was before there was a switch
    }
  }
  const save = async (settings: TraySettings): Promise<boolean> => {
    const text = JSON.stringify(settings)
    try {
      await primary.set(key, text)
      // Nothing may outrank what was just saved: drop the fallback copy, or make it the same if it will not go.
      try {
        await fallback.remove(key)
      } catch {
        await fallback.set(key, text).catch(() => {})
      }
      return true
    } catch {
      try {
        await fallback.set(key, text)
        return true
      } catch {
        return false
      }
    }
  }

  const read = (): Promise<TraySettings> => (inForce ??= load())
  return {
    get: async (): Promise<TraySettings> => ({ ...(await read()) }),
    set: <K extends keyof TraySettings>(setting: K, value: TraySettings[K]): Promise<TraySettings> => {
      const next = read().then((current) => ({ ...current, [setting]: value }))
      inForce = next
      const saved = saves.then(async () => {
        const settings = await next
        if (!(await save(settings))) throw new Error(NOTIFICATION_SETTING_UNSAVED)
        return { ...settings }
      })
      saves = saved.catch(() => {})
      return saved
    }
  }
}
