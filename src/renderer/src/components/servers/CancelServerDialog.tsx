import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'

/**
 * Cancelling destroys the server and its data, and unlike every other action in
 * the app it cannot be undone or tracked - the API answers 204 and the server is
 * simply gone. So this asks for the hostname to be typed rather than offering a
 * single confirming click, the same bar used for removing DNS hosting.
 */
const REASONS = [
  'No longer required',
  'Too expensive',
  'Moving to another provider',
  'Performance did not meet expectations',
  'Technical issues',
  'Created by mistake / testing',
  'Other'
]

export const CancelServerDialog: React.FC<{
  isOpen: boolean
  serverName: string
  monthlyPrice?: number
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (reason: string) => void
}> = ({ isOpen, serverName, monthlyPrice, busy, error, onCancel, onConfirm }) => {
  const [reason, setReason] = useState(REASONS[0])
  const [detail, setDetail] = useState('')
  const [typed, setTyped] = useState('')
  if (!isOpen) return null

  const confirmed = typed.trim() === serverName
  const finalReason = reason === 'Other' ? detail.trim() : detail.trim() ? `${reason}: ${detail.trim()}` : reason

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 overlay-safe">
      <div className="w-full max-w-lg max-h-full flex flex-col bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[#ced4da] dark:border-[#373b3e]">
          <h3 className="font-bold text-sm text-[#212529] dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            Cancel Server
          </h3>
          <button type="button" onClick={onCancel} className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs text-[#212529] dark:text-slate-200">
          <div className="rounded border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 space-y-1">
            <p className="font-semibold text-rose-700 dark:text-rose-300">
              This destroys {serverName} and everything on it.
            </p>
            <p className="text-rose-700/90 dark:text-rose-300/90">
              The service is cancelled within five minutes and an invoice is generated for usage to date. Backups and
              snapshots attached to the server go with it. There is no undo.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1">Why are you cancelling?</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              className="w-full px-2 py-1.5 text-xs rounded border border-[#ced4da] dark:border-[#373b3e] bg-white dark:bg-[#212529]"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              disabled={busy}
              maxLength={200}
              placeholder={reason === 'Other' ? 'Tell us more (required)' : 'Anything to add? (optional)'}
              className="mt-2 w-full px-2 py-1.5 text-xs rounded border border-[#ced4da] dark:border-[#373b3e] bg-white dark:bg-[#212529]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1">
              Type <span className="font-mono text-rose-600 dark:text-rose-400">{serverName}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-xs font-mono rounded border border-[#ced4da] dark:border-[#373b3e] bg-white dark:bg-[#212529]"
            />
          </div>

          {typeof monthlyPrice === 'number' && monthlyPrice > 0 && (
            <p className="text-[11px] text-[#6c757d] dark:text-slate-400">
              This server currently bills at ${monthlyPrice.toFixed(2)}/month.
            </p>
          )}
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="flex-shrink-0 flex justify-end gap-2 p-4 border-t border-[#ced4da] dark:border-[#373b3e]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded border border-[#ced4da] dark:border-[#373b3e]"
          >
            Keep server
          </button>
          <button
            type="button"
            disabled={!confirmed || busy || (reason === 'Other' && !detail.trim())}
            onClick={() => onConfirm(finalReason)}
            className="px-3 py-1.5 text-xs rounded bg-rose-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Cancelling…' : 'Cancel Server'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
