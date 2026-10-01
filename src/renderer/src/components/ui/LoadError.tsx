import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  /** What failed to load, lower case: "VPC networks", "SSH keys". */
  what: string
  /** True when a previous load succeeded, so the list on screen is older rather than missing. */
  hasData: boolean
  message?: string
  isFetching: boolean
  onRetry: () => void
}

/**
 * A failed read must not look like an empty account: a page that answers "No VPC
 * Networks - Create Your First VPC" to a 500 invites a duplicate. Shown in place of
 * the empty state (and above any older list we still hold).
 */
export function LoadError({ what, hasData, message, isFetching, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 p-3 rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs"
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
      <div className="flex-1 min-w-0 space-y-2">
        <p className="font-semibold break-words">{hasData ? `Couldn't refresh the ${what}.` : `Couldn't load the ${what}.`}</p>
        {message && <p className="break-words line-clamp-3">{message}</p>}
        {hasData && <p>The list below is from the last successful load.</p>}
        <button
          onClick={onRetry}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#212529] dark:text-slate-200 bg-white dark:bg-[#2b3035] hover:bg-[#f1f1f1] dark:hover:bg-[#343a40] border border-[#ced4da] dark:border-[#373b3e] rounded transition shadow-sm disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Retry</span>
        </button>
      </div>
    </div>
  )
}
