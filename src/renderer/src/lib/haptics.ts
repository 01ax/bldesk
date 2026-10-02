/**
 * Vibrates the device for the given milliseconds (or a pattern), where it can. The Web Vibration API cannot change how
 * strong a vibration is, only how long, and it does nothing on desktop, on iOS, or where the app has no permission to
 * vibrate: every one of those is a silent no-op here, so a caller never has to check.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    // no vibration here
  }
}
