import React, { useState } from 'react'
import { X, Server, Globe, Cpu, Key, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useSizes, useRegions, useImages, useSshKeys, useVpcs, useCreateServerMutation } from '../../api/queries'

interface CreateServerModalProps {
  isOpen: boolean
  onClose: () => void
  client: BinaryLaneClient | null
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose, client }) => {
  const [name, setName] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('syd')
  const [selectedSize, setSelectedSize] = useState('std-1vcpu')
  const [selectedImage, setSelectedImage] = useState('ubuntu-24-04')
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [selectedVpc, setSelectedVpc] = useState<number | undefined>(undefined)
  const [enableBackups, setEnableBackups] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sizesQuery = useSizes(client)
  const regionsQuery = useRegions(client)
  const imagesQuery = useImages(client)
  const sshKeysQuery = useSshKeys(client)
  const vpcsQuery = useVpcs(client)
  const createServer = useCreateServerMutation(client)

  if (!isOpen) return null

  const sizes = sizesQuery.data || []
  const regions = regionsQuery.data || []
  const images = imagesQuery.data || []
  const sshKeys = sshKeysQuery.data || []
  const vpcs = vpcsQuery.data || []

  // Filter distribution base images
  const baseImages = images.filter((img: any) => img.type === 'distribution' || img.type === 'base' || !img.type)

  const currentSizeObj = sizes.find((s) => s.slug === selectedSize) || sizes[0]

  const handleToggleKey = (keyId: number) => {
    setSelectedKeys((prev) => (prev.includes(keyId) ? prev.filter((k) => k !== keyId) : [...prev, keyId]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!name.trim()) {
      setErrorMsg('Please enter a server hostname.')
      return
    }

    try {
      await createServer.mutateAsync({
        name: name.trim(),
        region: selectedRegion,
        size: selectedSize,
        image: selectedImage,
        ssh_keys: selectedKeys.length > 0 ? selectedKeys : undefined,
        vpc_id: selectedVpc,
        backups: enableBackups
      })

      window.bldeskApi.sendNotification({
        title: 'Server Provisioning Started',
        body: `Instance "${name}" is now deploying in ${selectedRegion.toUpperCase()}.`
      })

      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create server.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in select-text">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
              <Server className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Deploy Virtual Server</h2>
              <p className="text-xs text-slate-400">High-performance SSD cloud compute instance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Hostname */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Server Hostname</label>
            <input
              type="text"
              required
              placeholder="e.g. web-syd-01.term.au"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Region Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Target Region</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {regions.map((reg) => {
                const isSelected = selectedRegion === reg.slug
                return (
                  <button
                    key={reg.slug}
                    type="button"
                    onClick={() => setSelectedRegion(reg.slug)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition ${
                      isSelected
                        ? 'bg-sky-600/20 border-sky-500/60 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-slate-100">{reg.name}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-mono">{reg.slug}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* OS Image Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200">Operating System Image</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
              {baseImages.slice(0, 12).map((img) => {
                const isSelected = selectedImage === (img.slug || String(img.id))
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelectedImage(img.slug || String(img.id))}
                    className={`p-2 rounded-lg border text-left text-xs transition ${
                      isSelected
                        ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                        : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium truncate">{img.name}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{img.distribution}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Plan / Size Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>Compute Size & Resources</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
              {sizes.slice(0, 8).map((sz) => {
                const isSelected = selectedSize === sz.slug
                return (
                  <button
                    key={sz.slug}
                    type="button"
                    onClick={() => setSelectedSize(sz.slug)}
                    className={`p-3 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-purple-950/30 border-purple-500 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{sz.slug}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {sz.vcpus} vCPU • {Math.round((sz.memory || 1024) / 1024)}GB RAM • {sz.disk}GB SSD
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-sky-400 text-xs">
                      ${sz.price_monthly || 5}/mo
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* SSH Keys & VPC */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SSH Keys */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>SSH Public Keys</span>
              </label>
              <div className="space-y-1 max-h-24 overflow-y-auto bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                {sshKeys.length === 0 && <span className="text-slate-500 text-[11px]">No SSH keys on account.</span>}
                {sshKeys.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 text-slate-300 cursor-pointer select-none text-[11px]">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(k.id)}
                      onChange={() => handleToggleKey(k.id)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-0"
                    />
                    <span className="truncate">{k.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* VPC Attachment */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200">VPC Network</label>
              <select
                value={selectedVpc || ''}
                onChange={(e) => setSelectedVpc(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              >
                <option value="">Public Default Network</option>
                {vpcs.map((vpc) => (
                  <option key={vpc.id} value={vpc.id}>
                    {vpc.name} ({vpc.ip_range})
                  </option>
                ))}
              </select>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableBackups"
                  checked={enableBackups}
                  onChange={(e) => setEnableBackups(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-0"
                />
                <label htmlFor="enableBackups" className="text-xs text-slate-300 select-none cursor-pointer">
                  Enable automated daily backups
                </label>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer & Submit */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Estimated Cost</div>
              <div className="text-sm font-bold text-white font-mono">
                ${currentSizeObj?.price_monthly || 5}.00 AUD / month
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createServer.isPending}
                className="flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition shadow-lg shadow-sky-950/40 disabled:opacity-50"
              >
                {createServer.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Provisioning Instance...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Deploy Server</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
