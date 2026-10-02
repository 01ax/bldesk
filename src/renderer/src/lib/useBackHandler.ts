import { useEffect, useRef } from 'react'
import { pushBackHandler } from './backStack'

/**
 * While active, the Android back button runs the handler (and nothing else) instead of leaving the screen. A thing
 * that opens on top of another registers later, so it is closed first. The handler may change between renders.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => latest.current())
  }, [active])
}
