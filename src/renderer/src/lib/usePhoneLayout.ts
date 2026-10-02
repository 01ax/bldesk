import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/** Tailwind's md breakpoint: from here up the app shows its desktop layout (the sidebar), below it the phone layout (the drawer). */
const DESKTOP_LAYOUT = '(min-width: 768px)'

/**
 * Whether the app is showing its phone layout: a window or screen narrower than 768 px (the same breakpoint the
 * sidebar and the drawer change at, so a narrow desktop window counts), or the native Android app, which is a phone
 * whatever its width. Follows the window as it is resized.
 */
export function usePhoneLayout(): boolean {
  const native = Capacitor.isNativePlatform()
  const [narrow, setNarrow] = useState(() => !window.matchMedia(DESKTOP_LAYOUT).matches)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_LAYOUT)
    const update = () => setNarrow(!query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return native || narrow
}
