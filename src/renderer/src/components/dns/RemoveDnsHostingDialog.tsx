import React, { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'

/**
 * Confirmation for removing DNS hosting.
 *
 * `DELETE /v2/domains/{domain_name}` drops the zone and every record in it, and
 * the API offers no way to get them back — there is no undo, no soft delete, and
 * no export beyond whatever the operator has already copied. A single `confirm()`
 * is not enough guard for that, so this requires the domain name to be typed and
 * shows the record count that will go with it.
 */
export const RemoveDnsHostingDialog: React.FC<{
  domain: string
  recordCount?: number
  isDeleting: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
  onCopyZone?: () => void
}> = ({ domain, recordCount, isDeleting, error, onCancel, onConfirm, onCopyZone }) => {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === domain.toLowerCase()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, isDeleting])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[#ced4da] dark:border-[#373b3e]">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <h3 className="font-bold text-sm">Remove DNS hosting</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white transition disabled:opacity-40"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-[#212529] dark:text-[#f8f9fa]">
            This deletes the DNS zone for{' '}
            <span className="font-mono font-semibold">{domain}</span>
            {typeof recordCount === 'number' && (
              <>
                {' '}
                and all <span className="font-semibold">{recordCount}</span> record
                {recordCount === 1 ? '' : 's'} in it
              </>
            )}
            .
          </p>

          <div className="p-2.5 rounded border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 leading-relaxed">
            There is no undo. BinaryLane keeps no copy of a deleted zone, so the records cannot be
            recovered afterwards — they would have to be recreated by hand.
            {onCopyZone && (
              <>
                {' '}
                <button onClick={onCopyZone} className="underline font-medium hover:no-underline">
                  Copy the zone file first
                </button>
                .
              </>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-[#6c757d] dark:text-[#adb5bd]">
              Type <span className="font-mono text-[#212529] dark:text-[#f8f9fa]">{domain}</span> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isDeleting}
              spellCheck={false}
              autoComplete="off"
              className="w-full px-2.5 py-1.5 font-mono bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded outline-none focus:border-rose-500 text-[#212529] dark:text-white disabled:opacity-50"
            />
          </label>

          {error && <div className="text-rose-600 dark:text-rose-400 break-words">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[#ced4da] dark:border-[#373b3e]">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[#ced4da] dark:border-[#373b3e] text-[#212529] dark:text-slate-200 hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white transition disabled:opacity-40 disabled:hover:bg-rose-600"
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isDeleting ? 'Removing...' : 'Remove DNS hosting'}
          </button>
        </div>
      </div>
    </div>
  )
}
