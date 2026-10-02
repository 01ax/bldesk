import { useSyncExternalStore } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { dismissFailure, getFailures, subscribeFailures } from '../../lib/failures'

/** The failures reported with `notifyFailure`, in place of the native `alert()` dialogs they replaced. */
export function useFailures() {
  return useSyncExternalStore(subscribeFailures, getFailures, getFailures)
}

/**
 * Rendered by `ActionToasts` in its own column, so a failure and a tracked action stack instead of covering each
 * other. Failures stay until dismissed, like a failed action.
 */
export function FailureToastItems() {
  const failures = useFailures()
  return (
    <>
      {failures.map((f) => (
        <div
          key={f.id}
          role="alert"
          className="pointer-events-auto bg-white dark:bg-[#2b3035] border border-rose-300 dark:border-rose-900 rounded-lg shadow-2xl p-3 text-xs flex items-start gap-2.5 animate-in slide-in-from-bottom-2 fade-in duration-150"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="font-semibold text-[#212529] dark:text-white break-words">{f.title}</div>
            {f.detail && <div className="text-[11px] text-[#495057] dark:text-[#adb5bd] break-words">{f.detail}</div>}
            {f.note && <div className="text-[11px] text-[#495057] dark:text-[#adb5bd] break-words">{f.note}</div>}
            {f.code && (
              <code className="block text-[11px] font-mono bg-[#f1f3f5] dark:bg-[#1f2326] rounded px-2 py-1 break-all select-text">
                {f.code}
              </code>
            )}
          </div>
          <button
            onClick={() => dismissFailure(f.id)}
            aria-label={`Dismiss: ${f.title}`}
            className="p-0.5 text-[#6c757d] hover:text-[#212529] dark:hover:text-white rounded flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </>
  )
}
