import React, { useState } from 'react'
import { Settings, Bell } from 'lucide-react'
import type { NotificationSettingKey } from '@shared/ipc-types'
import { HelpLink } from '../ui/HelpLink'
import { Modal } from '../ui/Modal'
import { useNotificationSettings } from '../../lib/traySettings'

/**
 * Settings for this device.
 *
 * Everything here is local to this device and its saved profiles, not the BinaryLane account: the main process keeps
 * it in tray.json (desktop) or the bridge in app preferences (Android), and nothing is sent to BinaryLane. The tray
 * menu edits the same switches, so this view follows it (see useNotificationSettings).
 *
 * Only the notification switches live here so far. The words for each one are here too, not in shared/notifications,
 * so the help page can quote them.
 */

// A Record, so a new notification category cannot ship without its wording.
const CATEGORIES: Record<NotificationSettingKey, { label: string; description: string }> = {
  notifyServerState: {
    label: 'Server state changes',
    description: 'A server appears, changes state or is no longer listed.'
  },
  notifyActions: {
    label: 'Action results',
    description: 'A server action is requested, finishes, fails, or pauses to ask you a question.'
  },
  notifyBalance: {
    label: 'Billing',
    description: 'Prepaid credit runs low, or an invoice payment fails.'
  },
  notifyGeneral: {
    label: 'Changes you make',
    description:
      'Confirmations after you change something in BLDesk, such as starting a backup, editing firewall rules or adding an SSH key, and the one-time note that BLDesk is still running in the tray.'
  },
  notifyUpdates: {
    label: 'BLDesk updates',
    description: 'A new version has finished downloading and is ready to install.'
  }
}

export const SettingsView: React.FC = () => {
  const { settings, set } = useNotificationSettings()
  const [choosing, setChoosing] = useState(false)
  const on = settings?.notificationsEnabled ?? true
  const keys = Object.keys(CATEGORIES) as NotificationSettingKey[]
  const enabled = settings ? keys.filter((key) => settings[key]).length : 0
  const summary = !settings
    ? ''
    : !on
      ? 'Muted: Show notifications is off.'
      : enabled === keys.length
        ? `All ${keys.length} kinds are on.`
        : `${enabled} of ${keys.length} kinds are on.`

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#212529] dark:text-white flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-[#017cb6]" />
          <span className="flex-1">Settings</span>
          <HelpLink slug="settings" />
        </h1>
        <p className="text-xs text-[#6c757d] dark:text-[#adb5bd] mt-1">
          Preferences for this device. They are not saved to your BinaryLane account.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* --- Notifications --- */}
        <Card title="Notifications" icon={Bell}>
          <Setting
            label="Show notifications"
            description="Turn this off to mute every notification. Your choices for each kind are kept for when you turn it back on."
            checked={on}
            disabled={!settings}
            onChange={(v) => void set('notificationsEnabled', v)}
          />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-[#212529] dark:text-white">Notify me about</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#6c757d] dark:text-[#adb5bd]">{summary || 'Loading…'}</p>
            </div>
            <button
              type="button"
              onClick={() => setChoosing(true)}
              disabled={!settings}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded border border-[#ced4da] dark:border-[#495057] bg-white dark:bg-[#343a40] text-[#212529] dark:text-white hover:bg-[#f1f3f5] dark:hover:bg-[#3d444b] transition disabled:opacity-50"
            >
              Choose kinds
            </button>
          </div>

          <Note>
            Muting only stops notifications sent through your operating system. Action progress, failures and History
            inside BLDesk are not affected, and your operating system can still hide notifications on its own.
          </Note>
        </Card>
      </div>

      {choosing && settings && (
        <Modal
          title="Notify me about"
          icon={Bell}
          size="sm"
          onClose={() => setChoosing(false)}
          footer={
            <div className="flex items-center justify-end gap-2 p-4">
              <button
                type="button"
                onClick={() => setChoosing(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded transition bg-[#017cb6] hover:bg-[#016594] text-white"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="p-4 space-y-4 text-xs text-[#212529] dark:text-white">
            {!on && (
              <p className="text-[11px] leading-relaxed text-[#6c757d] dark:text-[#adb5bd]">
                Show notifications is off, so none of these are shown. Turn it on to change them.
              </p>
            )}
            {keys.map((key) => (
              <Setting
                key={key}
                label={CATEGORIES[key].label}
                description={CATEGORIES[key].description}
                checked={settings[key]}
                disabled={!on}
                onChange={(v) => void set(key, v)}
              />
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

// --- presentational helpers (same look as the cards on Account Details) ---

const Card: React.FC<{ title: string; icon: React.FC<{ className?: string }>; children: React.ReactNode }> = ({
  title,
  icon: Icon,
  children
}) => (
  <div className="bg-white dark:bg-[#2b3035] border border-[#dee2e6] dark:border-[#373b3e] rounded-lg shadow-sm">
    <div className="px-4 py-2.5 border-b border-[#dee2e6] dark:border-[#373b3e] flex items-center gap-2">
      <Icon className="w-4 h-4 text-[#017cb6]" />
      <h3 className="font-semibold text-xs text-[#495057] dark:text-[#ced4da]">{title}</h3>
    </div>
    <div className="p-4 space-y-4 text-xs">{children}</div>
  </div>
)

const Setting: React.FC<{
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}> = ({ label, description, checked, disabled, onChange }) => (
  <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
    <div className="min-w-0">
      <div className="font-medium text-[#212529] dark:text-white">{label}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-[#6c757d] dark:text-[#adb5bd]">{description}</p>
    </div>
    <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
  </div>
)

const Switch: React.FC<{ label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }> = ({
  label,
  checked,
  disabled,
  onChange
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#017cb6] disabled:cursor-not-allowed ${
      checked ? 'bg-[#017cb6]' : 'bg-[#ced4da] dark:bg-[#495057]'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`}
    />
  </button>
)

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pt-2.5 border-t border-[#dee2e6] dark:border-[#373b3e] text-[11px] text-[#6c757d] dark:text-[#adb5bd] leading-relaxed">
    {children}
  </div>
)
