/**
 * Failures the user has to be told about, reported inside the app.
 *
 * This replaces the native `alert()` dialogs: those block the window, are
 * unstyled, look different on each operating system, and sit outside every
 * other error pattern the app has. A failure here shows as a toast that stays
 * until it is dismissed (`FailureToasts`), so an error nobody saw is not lost.
 *
 * It is a plain module rather than a React context so the library code that has
 * no component to hang a hook on (deep links, SSH launch) can report too.
 */

export interface Failure {
  id: number
  /** What failed, in a sentence: "Failed to add record". */
  title: string
  /** Why, in the words the API or the main process gave. */
  detail?: string
  /** A line of guidance after the reason. */
  note?: string
  /** Something to copy and run, shown verbatim. */
  code?: string
}

/** Few enough that a burst of failures cannot cover the window; the oldest go first. */
export const MAX_FAILURES = 5

let failures: Failure[] = []
let nextId = 1
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

/** The readable reason in whatever a catch block received, or undefined if there is none to show. */
export function reasonOf(reason: unknown): string | undefined {
  if (reason === undefined || reason === null) return undefined
  const text =
    typeof reason === 'string'
      ? reason
      : typeof (reason as { message?: unknown }).message === 'string'
        ? (reason as { message: string }).message
        : typeof reason === 'object'
          ? '' // an object with no message has nothing readable; "[object Object]" would be worse than saying so
          : String(reason)
  return text.trim() || 'Unknown error'
}

/**
 * Show a failure. The same failure raised again while it is still on screen is
 * not stacked a second time (a double-click must not pile up two of them).
 */
export function notifyFailure(title: string, reason?: unknown, extra: Pick<Failure, 'note' | 'code'> = {}): void {
  const detail = reasonOf(reason)
  const same = failures.some((f) => f.title === title && f.detail === detail && f.note === extra.note && f.code === extra.code)
  if (same) return
  failures = [...failures, { id: nextId++, title, detail, ...extra }].slice(-MAX_FAILURES)
  emit()
}

export function dismissFailure(id: number): void {
  if (!failures.some((f) => f.id === id)) return
  failures = failures.filter((f) => f.id !== id)
  emit()
}

export function subscribeFailures(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A stable reference between changes, as `useSyncExternalStore` requires. */
export function getFailures(): readonly Failure[] {
  return failures
}

/** For tests: forget everything. */
export function resetFailures(): void {
  failures = []
  nextId = 1
  emit()
}
