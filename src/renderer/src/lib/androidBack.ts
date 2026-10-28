import { Capacitor } from '@capacitor/core'

/*
 * What the back button closes before it changes screen: a dialog, or a menu or popover (the tag lists, a rule's address and port
 * lists), that has said it closes on Escape. Back sends it Escape. A popup that sets data-dismissible and a role that is not listed
 * here is skipped, and Back leaves the screen under it; scripts/check-ui-guards.mjs fails on one.
 */
export const DISMISSIBLE_SELECTOR = '[role="dialog"][data-dismissible="true"], [role="menu"][data-dismissible="true"]'

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
  if (Capacitor.getPlatform() !== 'android') return () => {}
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
    cancelled = true
    remove?.()
  }
}
