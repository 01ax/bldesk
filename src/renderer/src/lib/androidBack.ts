import { Capacitor } from '@capacitor/core'

/**
 * Back as a window event, on any platform: a test hook, not something the app itself sends. A script dispatches
 * `new CustomEvent(BACK_EVENT, { detail: { handled: null } })` to press back without a phone; `onBack` runs, the same
 * callback the native button runs, and `detail.handled` is set to its answer (false is what would send the app to the
 * background on Android).
 */
export const BACK_EVENT = 'bldesk:hardware-back'

/*
 * Android's back button. BLDesk switches views with React state, not browser
 * history, so without this back had nothing to go back to and closed the app
 * from any screen. `onBack` steps back through the app's own navigation and
 * returns false once there is nothing left, at which point the app is sent to
 * the background (like Home), keeping its state, rather than being closed.
 *
 * Desktop and the browser never load @capacitor/app.
 */
export function installAndroidBackButton(onBack: () => boolean): () => void {
  const onEvent = (e: Event) => {
    const handled = onBack()
    const detail = (e as CustomEvent<{ handled?: boolean } | null>).detail
    if (detail && typeof detail === 'object') detail.handled = handled
  }
  window.addEventListener(BACK_EVENT, onEvent)
  if (Capacitor.getPlatform() !== 'android') return () => window.removeEventListener(BACK_EVENT, onEvent)
  let cancelled = false
  let remove: (() => void) | undefined
  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('backButton', () => {
        if (!onBack()) void App.minimizeApp()
      })
    )
    .then((handle) => {
      if (cancelled) void handle.remove()
      else remove = () => void handle.remove()
    })
    .catch((err) => console.warn('[androidBack] back button unavailable:', err))
  return () => {
    window.removeEventListener(BACK_EVENT, onEvent)
    cancelled = true
    remove?.()
  }
}
