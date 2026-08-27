import React, { useState } from 'react'
import { X, Key, ShieldCheck, ExternalLink, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { AccountProfile } from '@shared/ipc-types'
import { createBinaryLaneClient } from '../../api/client'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  profiles: Omit<AccountProfile, 'token'>[]
  activeProfile: AccountProfile | null
  onProfileAddedOrUpdated: () => void
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  profiles,
  activeProfile,
  onProfileAddedOrUpdated
}) => {
  const [profileName, setProfileName] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [isDefault, setIsDefault] = useState(profiles.length === 0)
  const [isValidating, setIsValidating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleOpenTokenPage = () => {
    window.bldeskApi.openExternal('https://home.binarylane.com.au/api-tokens')
  }

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    const cleanToken = tokenInput.trim()
    if (!cleanToken) {
      setErrorMsg('Please enter a valid BinaryLane API token.')
      return
    }

    setIsValidating(true)

    try {
      // Validate token live against BinaryLane API
      const client = createBinaryLaneClient(cleanToken)
      const { data, error } = await client.GET('/v2/account')

      if (error || !data?.account) {
        throw new Error('API token verification failed. Please ensure the token is active and has correct permissions.')
      }

      const verifiedEmail = data.account.email
      const name = profileName.trim() || verifiedEmail || 'BinaryLane Account'

      // Save encrypted into SafeStorage Vault
      const result = await window.bldeskApi.saveProfile({
        name,
        token: cleanToken,
        isDefault
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to save token to secure storage.')
      }

      setSuccessMsg(`Account "${name}" connected successfully!`)
      setTokenInput('')
      setProfileName('')
      onProfileAddedOrUpdated()
      setTimeout(() => {
        onClose()
      }, 900)
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while validating the token.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    if (confirm('Are you sure you want to remove this account profile?')) {
      await window.bldeskApi.deleteProfile(id)
      onProfileAddedOrUpdated()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
              <Key className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Account Vault & API Access</h2>
              <p className="text-xs text-slate-400">Encrypted with OS hardware security (safeStorage)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active / Stored Profiles List */}
          {profiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Connected Profiles ({profiles.length})
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {profiles.map((p) => {
                  const isActive = activeProfile?.id === p.id
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                        isActive
                          ? 'bg-sky-950/40 border-sky-500/40 text-white'
                          : 'bg-slate-950/40 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span className="font-medium">{p.name}</span>
                        {isActive && (
                          <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">
                            Active
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteProfile(p.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Add New Token Form */}
          <form onSubmit={handleSaveToken} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Profile Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Personal Cloud, Work Fleet"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-200">Personal Access Token (PAT)</label>
                <button
                  type="button"
                  onClick={handleOpenTokenPage}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
                >
                  <span>Generate Token in mPanel</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="Paste your BinaryLane API token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-0"
              />
              <label htmlFor="isDefault" className="text-xs text-slate-400 select-none cursor-pointer">
                Set as default active profile
              </label>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isValidating || !tokenInput.trim()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition shadow-lg shadow-sky-900/30"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Token...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Connect & Encrypt</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
