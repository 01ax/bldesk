import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Receipt, X } from 'lucide-react'
import { TrackedAction, TrackedActionState, useTrackedActions } from '../../context/ActionTrackerContext'

/**
 * Toast host for actions being tracked to completion. Deliberately in-house:
 * the app carries no toast dependency, and this needs only four states.
 *
 * Mounted at the app shell so a tracked action outlives the view that started
 * it — the point of tracking is that you can navigate away from a rebuild.
 *
 * It also shows failures that have no action to follow (`showFailure`): a request BinaryLane refused, a terminal or
 * console window that did not open, a link that could not be followed.
 */

export interface Failure {
  /** What failed, briefly: "Failed to delete rule". */
  label: string
  /** The server, domain or key it was for, when there is one. */
  resourceName?: string
  /** Why, in words: the API's reason as `describeApiError` gives it. */
  detail: string
}

const FAILURE_EVENT = 'bldesk:failure'
/** Failure toasts kept on screen: the latest ones. A repeat of the last one is counted on it instead of added. */
const MAX_FAILURES = 3

/**
 * Report a failure in a toast, from a component or from code outside React. Like a failed action it stays until it is
 * closed (or newer failures replace it). A failure of a form that stays open is shown in that form instead.
 */
export function showFailure(failure: Failure): void {
  const shown = !window.dispatchEvent(new CustomEvent<Failure>(FAILURE_EVENT, { detail: failure, cancelable: true }))
  // No toast host is mounted (the crash screen): the failure still reaches the console.
  if (!shown) console.error(`[BLDesk] ${failure.label}${failure.resourceName ? ` · ${failure.resourceName}` : ''}: ${failure.detail}`)
}

const TONE: Record<TrackedActionState, { icon: typeof Loader2; className: string; spin?: boolean }> = {
  running: { icon: Loader2, className: 'text-[#017cb6]', spin: true },
  completed: { icon: CheckCircle2, className: 'text-emerald-500' },
  errored: { icon: AlertTriangle, className: 'text-red-500' },
  'awaiting-interaction': { icon: HelpCircle, className: 'text-[#f1ca00]' },
  'blocked-by-invoice': { icon: Receipt, className: 'text-[#f1ca00]' },
  lost: { icon: AlertTriangle, className: 'text-amber-500' }
}

function statusLine(action: TrackedAction): string {
  switch (action.state) {
    case 'running':
      return typeof action.percentComplete === 'number' && action.percentComplete > 0
        ? `In progress — ${action.percentComplete}%`
        : 'In progress on BinaryLane…'
    case 'completed':
      return action.detail || 'Completed'
    case 'errored':
      return action.detail || 'BinaryLane reported an error'
    case 'awaiting-interaction':
      return 'Waiting for your answer — see the prompt'
    case 'blocked-by-invoice':
      // Says what BinaryLane reports and no more: the spec states only that the
      // action is blocked by an invoice requiring payment. Whether paying it
      // resumes this action is not something to promise on its behalf.
      return action.detail || 'Blocked by an invoice that requires payment'
    case 'lost':
      // Careful wording: losing track of an action says nothing about whether
      // it applied. Claiming either way here would be a guess.
      return action.detail || 'Lost track of this action — check the server before retrying'
  }
}

export function ActionToasts({ profileId }: { profileId?: string }) {
  const { tracked: all, dismiss } = useTrackedActions()
  const tracked = all.filter((a) => !a.dismissed)
  const [failures, setFailures] = useState<(Failure & { id: number; count: number })[]>([])
  const nextFailureId = useRef(0)
  useEffect(() => {
    const add = (event: Event) => {
      event.preventDefault() // shown: showFailure need not fall back to the console
      const failure = (event as CustomEvent<Failure>).detail
      setFailures((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.label === failure.label && last.resourceName === failure.resourceName && last.detail === failure.detail) {
          return [...prev.slice(0, -1), { ...last, count: last.count + 1 }]
        }
        return [...prev, { ...failure, id: nextFailureId.current++, count: 1 }].slice(-MAX_FAILURES)
      })
    }
    window.addEventListener(FAILURE_EVENT, add)
    return () => window.removeEventListener(FAILURE_EVENT, add)
  }, [])
  // A failure belongs to the account it happened in, like the token banner: switching account clears them, as it clears
  // the tracked actions.
  useEffect(() => setFailures([]), [profileId])
  // A failure is drawn as a failed action that has no action behind it.
  const toasts = [
    ...tracked.map((action) => ({ key: `action-${action.actionId}`, action, failure: false, onDismiss: () => dismiss(action.actionId) })),
    ...failures.map((f) => ({
      key: `failure-${f.id}`,
      action: { actionId: 0, label: f.count > 1 ? `${f.label} (${f.count} times)` : f.label, resourceName: f.resourceName, state: 'errored', detail: f.detail, startedAt: 0 } as TrackedAction,
      failure: true,
      onDismiss: () => setFailures((prev) => prev.filter((x) => x.id !== f.id))
    }))
  ]
  if (toasts.length === 0) return null

  return (
    /*
     * Above the mobile navigation bar, not behind it.
     *
     * `BottomNav` is `md:hidden fixed bottom-0` and stands
     * `3.5rem + env(safe-area-inset-bottom)` tall, so a toast at `bottom-4`
     * sat underneath it and, on a phone with gesture navigation, ran off the
     * bottom of the screen as well - the close button with it. The offset
     * matches the bar's own height expression so the two cannot drift apart,
     * and it applies only where the bar exists.
     *
     * Never taller than the window below the title bar: past that the column scrolls, newest at the bottom, instead of
     * climbing over the title bar's controls. The padding (with the offsets reduced by as much) leaves the cards'
     * shadows room inside the scrolling box; the cards sit where they did.
     *
     * Below dialogs (a dialog is z-70) on purpose. A dialog is modal: its backdrop and Tab trap leave everything else
     * inert, and a toast above it would cover the dialog's own buttons (one toast covers a confirm dialog's Cancel and
     * confirm buttons in a 1024x680 window at 150%). A failure raised while a dialog is open waits, dimmed, until the
     * dialog is closed.
     */
    <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0 right-0 z-[55] flex flex-col-reverse gap-2 w-[22rem] max-w-[100vw] px-4 pt-4 pb-3 md:pb-4 max-h-[calc(100vh-2.75rem-env(safe-area-inset-top,0px)-3.5rem-env(safe-area-inset-bottom,0px))] md:max-h-[calc(100vh-2.75rem-env(safe-area-inset-top,0px))] overflow-y-auto pointer-events-none">
      {/* Reversed, so the column (bottom up) reads as before and a column that scrolls opens on the newest. */}
      {[...toasts].reverse().map(({ key, action, failure, onDismiss }) => {
        const tone = TONE[action.state]
        const Icon = tone.icon
        const title = action.resourceName ? `${action.label} · ${action.resourceName}` : action.label
        return (
          <div
            key={key}
            role={failure ? 'alert' : undefined}
            className={`pointer-events-auto bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl p-3 text-xs flex items-start gap-2.5 animate-in slide-in-from-bottom-2 fade-in duration-150 ${failure ? 'select-text' : ''}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tone.className} ${tone.spin ? 'animate-spin' : ''}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#212529] dark:text-white truncate" title={title}>
                {action.label}
                {action.resourceName && (
                  <span className="font-normal text-[#495057] dark:text-[#adb5bd]"> · {action.resourceName}</span>
                )}
              </div>
              <div className={`text-[11px] text-[#495057] dark:text-[#adb5bd] break-words ${failure ? 'whitespace-pre-line' : ''}`}>{statusLine(action)}</div>
              {action.state === 'running' && action.stepDetail && (
                <div className="text-[11px] text-[#6c757d] dark:text-[#8b9299] break-words mt-0.5">
                  {action.stepDetail}
                </div>
              )}
            </div>
            <button
              onClick={onDismiss}
              aria-label={`Dismiss ${action.label} notification`}
              className="p-0.5 text-[#6c757d] hover:text-[#212529] dark:hover:text-white rounded flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
