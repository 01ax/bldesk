import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react'
import type { DiffLine, FieldChange } from '../lib/diff'
import { summariseDiff } from '../lib/diff'
import { recordChange, type ChangeSeverity, type ChangeTarget } from '../lib/changelog'

/**
 * One confirm dialog for every mutation (FEATURES.md #5), replacing the
 * scattered `window.confirm()` calls.
 *
 * A request says what will change — a summary, a before → after table, or a
 * line diff — and how bad getting it wrong is. `irreversible` requests make
 * the user type the target's name. Confirming records the change in the local
 * change log and hands back its id, so the caller (or the action tracker) can
 * report how it ended.
 */

export interface ConfirmRequest {
  /** Verb phrase: "Reboot server", "Delete firewall rule". */
  title: string
  /** What it applies to, shown in monospace next to the title. */
  target?: ChangeTarget
  /** One or two sentences: what will happen. */
  summary?: string
  severity?: ChangeSeverity
  /** Warnings, shown in amber. */
  notes?: string[]
  /** Before → after per field. */
  changes?: FieldChange[]
  /** Whole-document diff, e.g. a firewall rule list. */
  diff?: DiffLine[]
  /** Text the user must type. Defaults to the target name for `irreversible`. */
  typeToConfirm?: string
  confirmLabel?: string
  /** Set false to confirm without writing a change-log entry (local-only actions). */
  log?: boolean
  /** Where it was started from, for the log. */
  source?: 'ui' | 'palette'
}

export type ConfirmResult = { ok: false } | { ok: true; changeId?: string }

type ConfirmFn = (req: ConfirmRequest) => Promise<ConfirmResult>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * The confirm function. Outside a provider (tests, odd mounts) it degrades to
 * `window.confirm` so nothing silently runs unconfirmed.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  return (
    ctx ??
    (async (req) => {
      const text = [req.title, req.target?.name, req.summary].filter(Boolean).join(' — ')
      return window.confirm(text) ? { ok: true } : { ok: false }
    })
  )
}

interface Pending {
  req: ConfirmRequest
  resolve: (r: ConfirmResult) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const queue = useRef<Pending[]>([])

  const confirm = useCallback<ConfirmFn>((req) => {
    return new Promise<ConfirmResult>((resolve) => {
      const item = { req, resolve }
      setPending((cur) => {
        if (cur) {
          queue.current.push(item)
          return cur
        }
        return item
      })
    })
  }, [])

  const settle = useCallback(
    async (ok: boolean) => {
      const cur = pending
      if (!cur) return
      let result: ConfirmResult = { ok: false }
      if (ok) {
        let changeId: string | undefined
        if (cur.req.log !== false && cur.req.target) {
          changeId = await recordChange({
            label: cur.req.title,
            target: cur.req.target,
            severity: cur.req.severity ?? 'normal',
            summary: cur.req.summary,
            changes: cur.req.changes,
            diff: cur.req.diff,
            source: cur.req.source ?? 'ui'
          })
        }
        result = { ok: true, changeId }
      }
      setPending(queue.current.shift() ?? null)
      cur.resolve(result)
    },
    [pending]
  )

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialog req={pending.req} onSettle={settle} />}
    </ConfirmContext.Provider>
  )
}

// ---------------------------------------------------------------------------

function ConfirmDialog({ req, onSettle }: { req: ConfirmRequest; onSettle: (ok: boolean) => void }) {
  const severity = req.severity ?? 'normal'
  const mustType = req.typeToConfirm ?? (severity === 'irreversible' ? req.target?.name : undefined)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const typedOk = !mustType || typed.trim().toLowerCase() === mustType.toLowerCase()
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mustType) primaryRef.current?.focus()
  }, [mustType])

  const finish = (ok: boolean) => {
    if (busy) return
    if (ok && !typedOk) return
    setBusy(true)
    onSettle(ok)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        finish(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedOk, busy])

  const tone =
    severity === 'irreversible'
      ? { icon: ShieldAlert, head: 'text-rose-600 dark:text-rose-400', btn: 'bg-rose-600 hover:bg-rose-700' }
      : severity === 'destructive'
        ? { icon: AlertTriangle, head: 'text-amber-600 dark:text-amber-400', btn: 'bg-rose-600 hover:bg-rose-700' }
        : { icon: Check, head: 'text-[#017cb6]', btn: 'bg-[#017cb6] hover:bg-[#016594]' }
  const Icon = tone.icon

  const diffSummary = req.diff ? summariseDiff(req.diff) : null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 select-none" onMouseDown={() => finish(false)}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[#ced4da] dark:border-[#373b3e]">
          <div className={`flex items-center gap-2 min-w-0 ${tone.head}`}>
            <Icon className="w-5 h-5 flex-shrink-0" />
            <h3 id="confirm-title" className="font-bold text-sm truncate">
              {req.title}
              {req.target && (
                <span className="ml-2 font-mono font-normal text-[#212529] dark:text-[#f8f9fa]">
                  {req.target.name}
                  {req.target.id !== undefined && <span className="text-[#6c757d]"> #{req.target.id}</span>}
                </span>
              )}
            </h3>
          </div>
          <button onClick={() => finish(false)} className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white transition" aria-label="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs max-h-[60vh] overflow-y-auto select-text">
          {req.summary && <p className="text-[#212529] dark:text-[#f8f9fa] leading-relaxed">{req.summary}</p>}

          {req.notes && req.notes.length > 0 && (
            <ul className="p-2.5 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 leading-relaxed space-y-1">
              {req.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {req.changes && req.changes.length > 0 && (
            <table className="w-full text-[11px] border border-[#ced4da] dark:border-[#373b3e] rounded overflow-hidden">
              <tbody>
                {req.changes.map((c, i) => (
                  <tr key={i} className="border-t first:border-t-0 border-[#ced4da] dark:border-[#373b3e]">
                    <td className="px-2 py-1.5 text-[#6c757d] dark:text-slate-400 whitespace-nowrap align-top w-1/3">{c.label}</td>
                    <td className="px-2 py-1.5 font-mono align-top">
                      {c.from !== undefined && <span className="text-rose-600 dark:text-rose-400 line-through break-all">{c.from}</span>}
                      {c.from !== undefined && c.to !== undefined && <span className="text-[#6c757d] mx-1.5">→</span>}
                      {c.to !== undefined ? (
                        <span className="text-emerald-700 dark:text-emerald-300 break-all">{c.to}</span>
                      ) : c.from !== undefined ? (
                        <span className="text-[#6c757d] ml-1.5">(removed)</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {req.diff && req.diff.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-[#6c757d] mb-1">
                <span>Before → after</span>
                <span>{diffSummary}</span>
              </div>
              <pre className="text-[11px] font-mono leading-5 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded p-2 overflow-x-auto max-h-64">
                {req.diff.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === 'add'
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
                        : l.kind === 'remove'
                          ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 line-through decoration-rose-400/60'
                          : 'text-[#6c757d] dark:text-slate-400'
                    }
                  >
                    <span className="inline-block w-4 select-none">{l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : ' '}</span>
                    {l.text}
                  </div>
                ))}
              </pre>
            </div>
          )}

          {mustType && (
            <label className="block space-y-1.5">
              <span className="text-[#6c757d] dark:text-[#adb5bd]">
                Type <span className="font-mono text-[#212529] dark:text-[#f8f9fa]">{mustType}</span> to confirm
              </span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                className="w-full px-2.5 py-1.5 font-mono bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded outline-none focus:border-rose-500 text-[#212529] dark:text-white"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-[#ced4da] dark:border-[#373b3e]">
          <span className="text-[10px] text-[#6c757d]">
            {severity === 'irreversible' ? 'No undo. ' : ''}
            {req.log === false ? '' : 'Recorded in History.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => finish(false)}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[#ced4da] dark:border-[#373b3e] text-[#212529] dark:text-slate-200 hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition"
            >
              Cancel <kbd className="ml-1 text-[9px] opacity-60">Esc</kbd>
            </button>
            <button
              ref={primaryRef}
              onClick={() => finish(true)}
              disabled={!typedOk || busy}
              className={`px-3 py-1.5 text-xs font-semibold rounded text-white transition disabled:opacity-40 ${tone.btn}`}
            >
              {req.confirmLabel ?? (severity === 'normal' ? 'Confirm' : req.title)} <kbd className="ml-1 text-[9px] opacity-70">↵</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
