import React, { useState } from 'react'
import {
  Archive,
  Plus,
  RotateCcw,
  HardDrive,
  Loader2,
  Server,
  Disc,
  Clock,
  ShieldCheck
} from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import {
  useServers,
  useServerBackups,
  useServerSnapshots,
  useTakeBackupMutation,
  useRestoreBackupMutation,
  useToggleAutomatedBackupsMutation,
  useAttachBackupMutation,
  useDetachBackupMutation
} from '../../api/queries'

interface BackupManagerProps {
  client: BinaryLaneClient | null
  initialServerId?: number | null
}

export const BackupManager: React.FC<BackupManagerProps> = ({ client, initialServerId }) => {
  const serversQuery = useServers(client)
  const servers = serversQuery.data || []

  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    initialServerId || (servers.length > 0 ? servers[0].id : null)
  )

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : null)
  const activeServer = servers.find((s) => s.id === activeServerId)

  // Queries for current server
  const backupsQuery = useServerBackups(client, activeServerId)
  const snapshotsQuery = useServerSnapshots(client, activeServerId)

  // Mutations
  const takeBackupMutation = useTakeBackupMutation(client, activeServerId)
  const restoreBackupMutation = useRestoreBackupMutation(client, activeServerId)
  const toggleAutomatedBackups = useToggleAutomatedBackupsMutation(client, activeServerId)
  const attachBackupMutation = useAttachBackupMutation(client, activeServerId)
  const detachBackupMutation = useDetachBackupMutation(client, activeServerId)

  // Form & Action states
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [actionProcessingId, setActionProcessingId] = useState<number | null>(null)

  const backups = backupsQuery.data || []
  const snapshots = snapshotsQuery.data || []

  // Combine and deduplicate images
  const allImages = [...backups, ...snapshots].filter(
    (img, index, self) => index === self.findIndex((t) => t.id === img.id)
  )

  const isBackupsEnabled = Boolean(
    (activeServer as any)?.backup_settings?.enabled ||
    (activeServer as any)?.next_backup_window ||
    (activeServer?.features || []).includes('backups' as any)
  )

  const isAttachedBackup = Boolean((activeServer as any)?.attached_backup)

  // Handle Take Snapshot
  const handleTakeSnapshot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeServerId) return

    try {
      await takeBackupMutation.mutateAsync(snapshotLabel.trim() || undefined)
      setIsTakingSnapshot(false)
      setSnapshotLabel('')
      window.bldeskApi.sendNotification({
        title: 'Snapshot Initiated',
        body: `Snapshot creation started for server "${activeServer?.name || activeServerId}".`
      })
    } catch (err: any) {
      alert(`Failed to take snapshot: ${err.message}`)
    }
  }

  // Handle Restore
  const handleRestore = async (imageId: number, imageName: string) => {
    const confirmed = confirm(
      `⚠️ RESTORE WARNING:\n\nAre you sure you want to restore "${imageName}" to server "${activeServer?.name}"?\n\nThe server's current disk will be overwritten with this point-in-time image.`
    )
    if (!confirmed) return

    setActionProcessingId(imageId)
    try {
      await restoreBackupMutation.mutateAsync(imageId)
      window.bldeskApi.sendNotification({
        title: 'Server Restore Initiated',
        body: `Restoring "${imageName}" to "${activeServer?.name}".`
      })
    } catch (err: any) {
      alert(`Failed to restore backup: ${err.message}`)
    } finally {
      setActionProcessingId(null)
    }
  }

  // Handle Attach as Secondary Disk
  const handleAttach = async (imageId: number, imageName: string) => {
    setActionProcessingId(imageId)
    try {
      await attachBackupMutation.mutateAsync(imageId)
      window.bldeskApi.sendNotification({
        title: 'Backup Mounted as Disk',
        body: `Attached "${imageName}" as secondary drive on "${activeServer?.name}".`
      })
    } catch (err: any) {
      alert(`Failed to attach backup: ${err.message}`)
    } finally {
      setActionProcessingId(null)
    }
  }

  // Handle Detach Disk
  const handleDetach = async () => {
    try {
      await detachBackupMutation.mutateAsync()
      window.bldeskApi.sendNotification({
        title: 'Backup Disk Detached',
        body: `Unmounted backup disk from "${activeServer?.name}".`
      })
    } catch (err: any) {
      alert(`Failed to detach backup: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header & Server Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Archive className="w-5 h-5 text-purple-400" />
            <span>Server Backups & Snapshots</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated recovery points, manual point-in-time snapshots, and disk image restores
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Server Switcher Dropdown */}
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 border border-slate-800 rounded-xl">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.networks?.v4?.[0]?.ip_address || `#${s.id}`})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsTakingSnapshot(!isTakingSnapshot)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Take Snapshot</span>
          </button>
        </div>
      </div>

      {/* Snapshot Form */}
      {isTakingSnapshot && (
        <form
          onSubmit={handleTakeSnapshot}
          className="p-4 bg-slate-900/90 border border-purple-500/40 rounded-2xl flex flex-col sm:flex-row items-end gap-3 text-xs animate-in fade-in shadow-xl"
        >
          <div className="flex-1 w-full">
            <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
              Snapshot Label / Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Pre-Deployment Backup / Config Backup"
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsTakingSnapshot(false)}
              className="px-3 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={takeBackupMutation.isPending}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition shadow disabled:opacity-50"
            >
              {takeBackupMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Taking Snapshot...</span>
                </>
              ) : (
                <>
                  <Disc className="w-3.5 h-3.5" />
                  <span>Create Snapshot Now</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Automated Backups Status Banner */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${isBackupsEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-white">
                Automated Daily Backups: {isBackupsEnabled ? 'ACTIVE' : 'DISABLED'}
              </h2>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${isBackupsEnabled ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                {isBackupsEnabled ? 'Protected' : 'Off'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isBackupsEnabled
                ? 'BinaryLane automatically retains daily and weekly recovery slots for this instance.'
                : 'Enable automated backups to ensure continuous disaster recovery points for this server.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => toggleAutomatedBackups.mutate(!isBackupsEnabled)}
          disabled={toggleAutomatedBackups.isPending}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition shadow ${
            isBackupsEnabled
              ? 'bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 border border-slate-700'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {toggleAutomatedBackups.isPending
            ? 'Updating...'
            : isBackupsEnabled
            ? 'Disable Automated Backups'
            : 'Enable Daily Backups'}
        </button>
      </div>

      {/* Attached Backup Notice */}
      {isAttachedBackup && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-800/50 rounded-2xl flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>A backup disk is currently attached to this server for file inspection.</span>
          </div>
          <button
            onClick={handleDetach}
            disabled={detachBackupMutation.isPending}
            className="px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 text-white font-medium rounded-lg transition"
          >
            {detachBackupMutation.isPending ? 'Detaching...' : 'Detach Disk'}
          </button>
        </div>
      )}

      {/* Backups & Snapshots Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Recovery Points & Images ({allImages.length})</h2>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {activeServer?.name} ({activeServer?.region?.slug?.toUpperCase()})
          </span>
        </div>

        {(backupsQuery.isLoading || snapshotsQuery.isLoading) && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        )}

        {!backupsQuery.isLoading && !snapshotsQuery.isLoading && allImages.length === 0 && (
          <div className="text-xs text-slate-400 p-8 text-center bg-slate-950/40 border border-slate-800/80 rounded-2xl space-y-2">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
              <Archive className="w-5 h-5" />
            </div>
            <div className="font-semibold text-white">No Backups or Snapshots Available</div>
            <p className="text-slate-500 max-w-sm mx-auto text-[11px]">
              Take a manual snapshot or enable automated backups above to establish recovery points for this server.
            </p>
          </div>
        )}

        {!backupsQuery.isLoading && !snapshotsQuery.isLoading && allImages.length > 0 && (
          <div className="space-y-2">
            {allImages.map((image) => {
              const isProcessing = actionProcessingId === image.id
              const createdDate = image.created_at
                ? new Date(image.created_at).toLocaleString()
                : 'Point-in-time'
              const sizeGb = (image as any).size_gigabytes || (image as any).min_disk_size || activeServer?.disk || 20
              const isSnapshot = image.type === 'snapshot' || !(image as any).backup_info

              return (
                <div
                  key={image.id}
                  className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-purple-400">
                      <HardDrive className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{image.name || `Image #${image.id}`}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                            isSnapshot
                              ? 'bg-sky-950 text-sky-400 border border-sky-800/50'
                              : 'bg-purple-950 text-purple-400 border border-purple-800/50'
                          }`}
                        >
                          {isSnapshot ? 'Manual Snapshot' : 'Automated Backup'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{createdDate}</span>
                        <span className="text-slate-600">•</span>
                        <span>{sizeGb} GB Disk</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Attach / Mount as Disk */}
                    <button
                      onClick={() => handleAttach(image.id, image.name || `#${image.id}`)}
                      disabled={isProcessing}
                      className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
                      title="Attach as secondary drive to inspect files"
                    >
                      Mount Disk
                    </button>

                    {/* Restore Button */}
                    <button
                      onClick={() => handleRestore(image.id, image.name || `#${image.id}`)}
                      disabled={isProcessing}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900 border border-amber-800/60 rounded-xl transition shadow disabled:opacity-50"
                      title="Restore server from this backup image"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
