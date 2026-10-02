/**
 * Failures the user has to be told about, reported inside the app.
 *
 * This replaces the native `alert()` dialogs: those block the window, are
 * unstyled, look different on each operating system, and sit outside every
 * other error pattern the app has. A failure here stays until it is dismissed,
 * so an error nobody saw is not lost, and it shows where the user is looking:
 * inside the dialog that is open when it is raised (a card above the dialog's
 * body, so it can never cover the dialog's buttons), otherwise as a toast at the
 * corner of the window (`FailureToasts`).
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
  /** How many times this same failure was raised while it was on screen; a retry that fails again shows as a higher count. */
  count: number
}

/** Few enough that a burst of failures cannot cover the window; the oldest go first. */
export const MAX_FAILURES = 5

let failures: Failure[] = []
let nextId = 1
const listeners = new Set<() => void>()

/**
 * The dialogs that are open, oldest first. A dialog owns the failures raised after it opened (ids from its `floor` up)
 * for as long as it is the one on top; the rest go to the corner of the window. When it closes they fall back to the
 * dialog beneath, or to the corner.
 */
interface DialogScope {
  token: symbol
  floor: number
}
let scopes: DialogScope[] = []

const NONE: readonly Failure[] = []
let floating: readonly Failure[] = failures
let inDialog: readonly Failure[] = NONE

/** Split the failures between the dialog on top and the corner. Run before every notification, so snapshots stay stable between them. */
const split = () => {
  const top = scopes[scopes.length - 1]
  inDialog = top ? failures.filter((f) => f.id >= top.floor) : NONE
  floating = top ? failures.filter((f) => f.id < top.floor) : failures
}
const emit = () => {
  split()
  listeners.forEach((l) => l())
}

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
 * not stacked a second time (a double-click must not pile up two of them); its
 * count goes up instead, so a retry that fails again is not mistaken for nothing
 * happening. It is raised afresh, as the newest, so it shows in the dialog that is open now.
 */
export function notifyFailure(title: string, reason?: unknown, extra: Pick<Failure, 'note' | 'code'> = {}): void {
  const detail = reasonOf(reason)
  const same = failures.find((f) => f.title === title && f.detail === detail && f.note === extra.note && f.code === extra.code)
  if (same) {
    failures = [...failures.filter((f) => f !== same), { ...same, id: nextId++, count: same.count + 1 }]
  } else {
    failures = [...failures, { id: nextId++, title, detail, ...extra, count: 1 }].slice(-MAX_FAILURES)
  }
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

/** Drop every failure on screen. For a change of account: a failure from one account must not sit over another's screens. */
export function clearFailures(): void {
  if (failures.length === 0) return
  failures = []
  emit()
}

/** Every failure on screen, wherever it shows. A stable reference between changes, as `useSyncExternalStore` requires. */
export function getFailures(): readonly Failure[] {
  return failures
}

/** The failures for the corner of the window: those raised outside any dialog, or before the dialog now on top opened. */
export function getFloatingFailures(): readonly Failure[] {
  return floating
}

/** A dialog is now open. Call `leaveDialog` with the same token when it closes. */
export function enterDialog(token: symbol): void {
  scopes = [...scopes, { token, floor: nextId }]
  emit()
}

export function leaveDialog(token: symbol): void {
  if (!scopes.some((s) => s.token === token)) return
  scopes = scopes.filter((s) => s.token !== token)
  emit()
}

/** What a dialog shows inside itself: everything raised since it opened, but only while it is the dialog on top. */
export function getDialogFailures(token: symbol): readonly Failure[] {
  return scopes[scopes.length - 1]?.token === token ? inDialog : NONE
}

/** For tests: forget everything. */
export function resetFailures(): void {
  failures = []
  scopes = []
  nextId = 1
  emit()
}
