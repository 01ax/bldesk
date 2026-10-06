/**
 * The screen's safe-area insets in pixels: how far the status bar (top) and the gesture bar (bottom) reach into the
 * window on an edge-to-edge phone (the page uses viewport-fit=cover). Zero on a desktop. env() cannot be read from
 * script directly, so a hidden probe takes the values as padding and they are read back from it.
 */
export function safeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body) return { top: 0, bottom: 0 }
  // Read once and kept: a popover asks for this on every scroll while it is open, and the insets change only when the
  // window does (a resize, a rotation), which is when the stored reading is thrown away.
  if (cached) return cached
  if (!watching) {
    watching = true
    window.addEventListener('resize', forget)
    window.addEventListener('orientationchange', forget)
  }
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const insets = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
  probe.remove()
  cached = insets
  return insets
}

let cached: { top: number; bottom: number } | null = null
let watching = false
function forget(): void {
  cached = null
}
