/**
 * When the updater looks for a new version. A check every six hours from launch left an update waiting for hours after
 * it was published: on one Ubuntu machine a restart installed a version that a newer release had already replaced, and
 * the next launch then needed a second download and a second password prompt. A check is only a small manifest, so it
 * runs hourly, and also when the window gets focus or the computer wakes, as long as the last one was not just now.
 */

export const CHECK_INTERVAL_MS = 60 * 60 * 1000
/** A focus or wake-up check is skipped if a check started more recently than this. */
export const MIN_GAP_BETWEEN_EVENT_CHECKS_MS = 15 * 60 * 1000
/** After the computer wakes the network may not be back yet, so the check waits this long. */
export const RESUME_CHECK_DELAY_MS = 15 * 1000

/** Whether a check is due: none has started yet, `minGapMs` has passed since the last, or the clock has gone backwards. */
export function dueForCheck(lastStartedAt: number | null, now: number, minGapMs: number): boolean {
  if (lastStartedAt === null) return true
  return now < lastStartedAt || now - lastStartedAt >= minGapMs
}
