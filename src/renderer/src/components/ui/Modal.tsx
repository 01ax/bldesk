import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'

/**
 * The one modal shell. Every dialog in the app — the confirm dialog, the
 * create-server form, the traceroute viewer, whatever comes next — is this
 * component with different insides, so they all look and behave the same:
 * same backdrop, same panel, same header with a close button, Escape and
 * backdrop-click to dismiss, body that scrolls when tall.
 *
 * Dialogs that *change* something still go through `useConfirm()`; this is
 * the shell underneath it. The mutation guard fails any `createPortal` outside
 * this file, so a new dialog has to be a `<Modal>` (AGENTS.md rule 2).
 */

export interface ModalProps {
  title: React.ReactNode
  icon?: LucideIcon
  /** Tailwind classes for the icon and title, e.g. a rose tone for danger. */
  headTone?: string
  onClose: () => void
  /** Panel width. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Centre (default) or hang from the top, which suits tall forms. */
  align?: 'center' | 'top'
  /** While true, Escape, the backdrop and the close button do nothing. */
  busy?: boolean
  /** Render the panel as a form so Enter submits and the footer can hold a submit button. */
  as?: 'div' | 'form'
  onSubmit?: (e: React.FormEvent) => void
  /** Bordered strip under the body: buttons, or a note. */
  footer?: React.ReactNode
  /** Extra content in the header, left of the close button. */
  headerRight?: React.ReactNode
  /** Disable text selection on the shell (confirm dialogs). Body keeps select-text. */
  noSelect?: boolean
  /** Stacking order; the default sits above the palette and toasts. */
  z?: number
  labelledBy?: string
  children: React.ReactNode
}

const WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
}

export const Modal: React.FC<ModalProps> = ({
  title,
  icon: Icon,
  headTone = 'text-[#212529] dark:text-white',
  onClose,
  size = 'md',
  align = 'center',
  busy = false,
  as = 'div',
  onSubmit,
  footer,
  headerRight,
  noSelect = false,
  z = 70,
  labelledBy = 'modal-title',
  children
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const Panel: any = as
  const panelProps = as === 'form' ? { onSubmit } : {}

  return createPortal(
    <div
      className={`fixed inset-0 flex ${align === 'top' ? 'items-start' : 'items-center'} justify-center bg-black/60 overlay-safe ${noSelect ? 'select-none' : ''}`}
      // Panels start below the app's title bar (2.75rem) rather than over it,
      // so a tall dialog's header does not collide with the window's own and
      // the drag region and window controls stay reachable.
      style={{ zIndex: z, paddingTop: 'calc(2.75rem + max(1rem, env(safe-area-inset-top, 0px)))' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <Panel
        {...panelProps}
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        className={`w-full ${WIDTH[size]} max-h-full flex flex-col bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div className="flex-shrink-0 flex items-start justify-between gap-3 p-4 border-b border-[#ced4da] dark:border-[#373b3e]">
          <div className={`flex items-center gap-2 min-w-0 ${headTone}`}>
            {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
            <h3 id={labelledBy} className="font-bold text-sm truncate">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white transition disabled:opacity-40"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto select-text">{children}</div>

        {footer && <div className="flex-shrink-0 border-t border-[#ced4da] dark:border-[#373b3e]">{footer}</div>}
      </Panel>
    </div>,
    document.body
  )
}
