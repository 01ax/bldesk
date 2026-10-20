import { useCallback, useEffect, useState } from 'react'
import type { NotificationSettingKey, TraySettings } from '@shared/ipc-types'
import { NOTIFICATION_SETTING_UNSAVED } from '@shared/notifications'
import { notifyFailure } from './failures'

/**
 * The device's notification settings, as the main process (or, on Android, the bridge) holds them. The tray menu can
 * change them too, so this listens for that instead of trusting what it read first.
 */
export function useNotificationSettings(): {
  settings: TraySettings | null
  set: (key: 'notificationsEnabled' | NotificationSettingKey, value: boolean) => Promise<void>
} {
  const [settings, setSettings] = useState<TraySettings | null>(null)

  useEffect(() => {
    let alive = true
    window.bldeskApi?.getTraySettings?.().then((s) => alive && setSettings(s)).catch(() => {})
    const unsubscribe = window.bldeskApi?.onTraySettingsChanged?.((s) => alive && setSettings(s))
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  const set = useCallback(async (key: 'notificationsEnabled' | NotificationSettingKey, value: boolean) => {
    // Show the switch where the user put it straight away; the saved value replaces it, or puts it back on failure.
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    try {
      setSettings(await window.bldeskApi.setTraySetting(key, value))
    } catch (err) {
      notifyFailure("Couldn't save the notification setting", err)
      window.bldeskApi?.getTraySettings?.().then(setSettings).catch(() => {})
    }
  }, [])

  return { settings, set }
}

/**
 * A change made from the tray menu that could not be saved has no caller to tell, so say so wherever the user is. A
 * change made on the Settings page is told by its own result (useNotificationSettings).
 */
export function useTraySaveFailures(): void {
  useEffect(
    () =>
      window.bldeskApi?.onTraySettingsChanged?.((_settings, unsaved) => {
        if (unsaved) notifyFailure("Couldn't save the setting", NOTIFICATION_SETTING_UNSAVED)
      }),
    []
  )
}
