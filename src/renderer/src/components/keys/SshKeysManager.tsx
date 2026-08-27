import React, { useState, useEffect } from 'react'
import { Key, Plus, Trash2, Download, Copy, Check, ShieldCheck, Loader2, Sparkles } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useSshKeys, useAddSshKeyMutation, useDeleteSshKeyMutation } from '../../api/queries'

interface SshKeysManagerProps {
  client: BinaryLaneClient | null
}

export const SshKeysManager: React.FC<SshKeysManagerProps> = ({ client }) => {
  const [isAdding, setIsAdding] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [localKeys, setLocalKeys] = useState<{ name: string; publicKey: string }[]>([])
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const sshKeysQuery = useSshKeys(client)
  const addKeyMutation = useAddSshKeyMutation(client)
  const deleteKeyMutation = useDeleteSshKeyMutation(client)

  const keys = sshKeysQuery.data || []

  useEffect(() => {
    // Scan local ~/.ssh directory
    window.bldeskApi.getLocalSshKeys().then(setLocalKeys)
  }, [])

  const handleCopyKey = (id: number, keyText: string) => {
    navigator.clipboard.writeText(keyText)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleImportLocalKey = async (localKey: { name: string; publicKey: string }) => {
    try {
      await addKeyMutation.mutateAsync({
        name: localKey.name,
        publicKey: localKey.publicKey
      })
      window.bldeskApi.sendNotification({
        title: 'SSH Key Imported',
        body: `Imported "${localKey.name}" from your local ~/.ssh directory.`
      })
    } catch (err: any) {
      alert(`Import failed: ${err.message}`)
    }
  }

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyName.trim() || !publicKey.trim()) return

    try {
      await addKeyMutation.mutateAsync({
        name: keyName.trim(),
        publicKey: publicKey.trim()
      })
      setIsAdding(false)
      setKeyName('')
      setPublicKey('')
      window.bldeskApi.sendNotification({
        title: 'SSH Key Added',
        body: `Key "${keyName}" added to your BinaryLane account.`
      })
    } catch (err: any) {
      alert(`Add failed: ${err.message}`)
    }
  }

  const handleDeleteKey = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete SSH key "${name}"?`)) return
    try {
      await deleteKeyMutation.mutateAsync(id)
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Key className="w-5 h-5 text-amber-400" />
            <span>SSH Public Keys</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Public keys for passwordless root and user access to your servers</p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add SSH Key</span>
        </button>
      </div>

      {/* Discovered Local Keys Banner */}
      {localKeys.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
              <Sparkles className="w-4 h-4" />
              <span>Discovered Local Keys on this Machine (~/.ssh)</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {localKeys.map((lk) => {
              const alreadyImported = keys.some((k) => k.public_key.trim() === lk.publicKey.trim())
              return (
                <div key={lk.name} className="flex items-center justify-between p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <Key className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="font-mono text-slate-200">{lk.name}.pub</span>
                  </div>
                  {alreadyImported ? (
                    <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40">
                      Already in Account
                    </span>
                  ) : (
                    <button
                      onClick={() => handleImportLocalKey(lk)}
                      disabled={addKeyMutation.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-sky-300 bg-sky-950 hover:bg-sky-900 border border-sky-800 rounded transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Import</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add Key Form */}
      {isAdding && (
        <form onSubmit={handleManualAdd} className="p-4 bg-slate-900/90 border border-sky-500/40 rounded-xl space-y-3 text-xs animate-in fade-in">
          <h2 className="text-xs font-semibold text-white">Add New SSH Key</h2>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Key Label / Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Workstation ED25519"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Public Key String</label>
            <textarea
              required
              rows={3}
              placeholder="ssh-ed25519 AAAA... or ssh-rsa AAAA..."
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-[11px]"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addKeyMutation.isPending}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition"
            >
              {addKeyMutation.isPending ? 'Saving...' : 'Add Key'}
            </button>
          </div>
        </form>
      )}

      {/* Account Keys List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex-1">
        <h2 className="text-sm font-bold text-white">Account Public Keys ({keys.length})</h2>

        {sshKeysQuery.isLoading && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          </div>
        )}

        {!sshKeysQuery.isLoading && keys.length === 0 && (
          <div className="text-xs text-slate-500 p-8 text-center bg-slate-950/40 rounded-xl">
            No SSH keys stored in your BinaryLane account.
          </div>
        )}

        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div className="space-y-1 truncate pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{k.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">#{k.id}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400 truncate max-w-md">
                  {k.fingerprint || k.public_key.slice(0, 48) + '...'}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopyKey(k.id, k.public_key)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                  title="Copy Full Public Key"
                >
                  {copiedId === k.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDeleteKey(k.id, k.name)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                  title="Delete Key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
