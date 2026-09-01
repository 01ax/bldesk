import React, { useState } from 'react'
import { X, Server, Globe, Cpu, Key, Loader2, AlertCircle } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useSizes, useRegions, useImages, useSshKeys, useVpcs, useCreateServerMutation } from '../../api/queries'
import { logoForDistribution } from '../../lib/distroHelper'

interface CreateServerModalProps {
  isOpen: boolean
  onClose: () => void
  client: BinaryLaneClient | null
  onCreated?: () => void
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  client,
  onCreated
}) => {
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

      window.bldeskApi?.sendNotification?.({
        title: 'Server Provisioning Started',
        body: `Server "${name}" is being provisioned in ${selectedRegion.toUpperCase()}.`
      })

      if (onCreated) onCreated()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Server deployment failed.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-2xl bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ced4da] dark:border-[#373b3e] bg-[#f1f1f1] dark:bg-[#262a2e]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#017cb6]" />
            <h3 className="font-bold text-sm text-[#212529] dark:text-white">Deploy Virtual Server</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#6c757d] hover:text-[#212529] dark:hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Hostname */}
          <div>
            <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-1">
              Server Hostname / Label
            </label>
            <input
              type="text"
              required
              placeholder="e.g. web-node-01.production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded focus:outline-none focus:border-[#017cb6]"
            />
          </div>

          {/* 2. Region Selector */}
          <div>
            <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#017cb6]" />
              <span>Target Data Centre Region</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {regions.map((r) => {
                const isSelected = selectedRegion === r.slug
                return (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => setSelectedRegion(r.slug)}
                    className={`p-2.5 rounded border text-left transition ${
                      isSelected
                        ? 'border-[#017cb6] bg-[#017cb6]/10 text-[#017cb6] font-semibold'
                        : 'border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-slate-200 hover:border-[#017cb6]'
                    }`}
                  >
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-[10px] text-[#6c757d] font-mono">{r.slug.toUpperCase()}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Operating System */}
          <div>
            <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-2">
              Operating System Distribution
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
              {baseImages.map((img: any) => {
                const isSelected = selectedImage === img.slug
                const icon = logoForDistribution(img.distribution)
                return (
                  <button
                    key={img.slug || img.id}
                    type="button"
                    onClick={() => setSelectedImage(img.slug || String(img.id))}
                    className={`p-2 rounded border text-left flex items-center gap-2 transition ${
                      isSelected
                        ? 'border-[#017cb6] bg-[#017cb6]/10 text-[#017cb6] font-semibold'
                        : 'border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-slate-200 hover:border-[#017cb6]'
                    }`}
                  >
                    <img src={icon} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                    <span className="truncate text-xs">{img.name || img.full_name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 4. Plan Size */}
          <div>
            <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#017cb6]" />
              <span>Compute Plan & Hardware Size</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
              {sizes.map((s) => {
                const isSelected = selectedSize === s.slug
                const ramGB = (s.memory / 1024).toFixed(0)
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setSelectedSize(s.slug)}
                    className={`p-2.5 rounded border text-left transition ${
                      isSelected
                        ? 'border-[#017cb6] bg-[#017cb6]/10 text-[#017cb6] font-semibold'
                        : 'border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-slate-200 hover:border-[#017cb6]'
                    }`}
                  >
                    <div className="font-semibold">{s.vcpus} vCPU • {ramGB} GB RAM</div>
                    <div className="text-[10px] text-[#6c757d]">{s.disk} GB NVMe • ${s.price_monthly}/mo</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 5. SSH Keys */}
          {sshKeys.length > 0 && (
            <div>
              <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-1 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[#f1ca00]" />
                <span>Inject SSH Public Keys</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {sshKeys.map((k) => {
                  const isChecked = selectedKeys.includes(k.id)
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => handleToggleKey(k.id)}
                      className={`px-3 py-1 rounded text-xs border transition ${
                        isChecked
                          ? 'border-[#017cb6] bg-[#017cb6] text-white font-medium'
                          : 'border-[#ced4da] dark:border-[#373b3e] bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-slate-200 hover:border-[#017cb6]'
                      }`}
                    >
                      {k.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 6. VPC Network Option */}
          {vpcs.length > 0 && (
            <div>
              <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                Attach to Virtual Private Cloud (optional)
              </label>
              <select
                value={selectedVpc || ''}
                onChange={(e) => setSelectedVpc(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded focus:outline-none focus:border-[#017cb6]"
              >
                <option value="">Default Public Network (No VPC)</option>
                {vpcs.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.ip_range})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Backups checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={enableBackups}
              onChange={(e) => setEnableBackups(e.target.checked)}
              className="rounded border-[#ced4da] text-[#017cb6] focus:ring-0"
            />
            <span className="text-[#495057] dark:text-[#ced4da]">
              Enable automated nightly snapshots during maintenance window
            </span>
          </label>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#ced4da] dark:border-[#373b3e]">
            <div className="text-xs text-[#6c757d]">
              Estimated Rate: <span className="font-bold text-[#212529] dark:text-white">${currentSizeObj?.price_monthly || 0}/mo</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-[#6c757d] hover:text-[#212529] dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createServer.isPending}
                className="px-4 py-2 bg-[#017cb6] hover:bg-[#016594] text-white font-medium rounded transition flex items-center gap-2 shadow-sm"
              >
                {createServer.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Deploy Server Now</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
