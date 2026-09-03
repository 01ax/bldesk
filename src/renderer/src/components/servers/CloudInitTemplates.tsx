import React, { useEffect, useState } from 'react'
import { Copy, ExternalLink, Plus, Save, Trash2, X } from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import { useFleetUserData } from '../../api/queries'
import { CloudInitTemplate, ListedTemplate, isTemplateStoreUnreadable, listTemplates, parseTemplate, removeTemplate, resetTemplateStorage, revealTemplate, saveTemplate, templateYaml } from '../../lib/templates'
import { useConfirm } from '../../context/ConfirmContext'

type Server = components['schemas']['Server']
type Image = components['schemas']['Image']

export function imageSupportsUserData(image: Image | null | undefined): boolean {
  return !!image?.distribution_info?.features?.includes('user-data')
}

export const CloudInitTemplates: React.FC<{
  client: BinaryLaneClient | null
  servers: Server[]
  onClose: () => void
  initialDraft?: { userData: string; source?: CloudInitTemplate['source'] }
}> = ({ client, servers, onClose, initialDraft }) => {
  const [items, setItems] = useState<ListedTemplate[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [userData, setUserData] = useState(initialDraft?.userData || '#cloud-config\n')
  const [draftMeta, setDraftMeta] = useState<Pick<CloudInitTemplate, 'created_at' | 'source'> | null>(
    initialDraft ? { created_at: new Date().toISOString(), source: initialDraft.source } : null
  )
  const [error, setError] = useState('')
  const [storeUnreadable, setStoreUnreadable] = useState(false)
  const [showFleet, setShowFleet] = useState(false)
  const confirmAction = useConfirm()
  const supportedServers = servers.filter((server) => imageSupportsUserData(server.image))
  const fleet = useFleetUserData(client, showFleet ? supportedServers.map((server) => server.id) : [])

  const refresh = async (keepSlug: string | null = selected) => {
    try {
      const next = await listTemplates()
      setStoreUnreadable(false)
      setItems(next)
      if (keepSlug && !next.some((item) => item.slug === keepSlug)) setSelected(null)
    } catch (err: any) {
      setStoreUnreadable(isTemplateStoreUnreadable(err))
      setError(err.message || 'Could not load templates.')
    }
  }

  useEffect(() => {
    let active = true
    listTemplates()
      .then((next) => { if (active) { setItems(next); setStoreUnreadable(false) } })
      .catch((err) => { if (active) { setStoreUnreadable(isTemplateStoreUnreadable(err)); setError(err.message || 'Could not load templates.') } })
    return () => { active = false }
  }, [])

  const choose = (item: ListedTemplate) => {
    setSelected(item.slug)
    if (!item.template) {
      setName('')
      setDescription('')
      setUserData('')
      setDraftMeta(null)
      setError(`Invalid template “${item.slug}”: ${item.error || 'could not parse YAML'}. You can reveal or delete the file.`)
      return
    }
    setName(item.template.name)
    setDescription(item.template.description)
    setUserData(item.template.user_data)
    setDraftMeta({ created_at: item.template.created_at, source: item.template.source })
    setError('')
  }

  const save = async () => {
    try {
      if (!name.trim() || !userData.trim()) throw new Error('Name and user data are required.')
      const slug = await saveTemplate({ name: name.trim(), description: description.trim(), created_at: draftMeta?.created_at || new Date().toISOString(), source: draftMeta?.source, user_data: userData }, selected || undefined)
      setSelected(slug)
      await refresh(slug)
      window.dispatchEvent(new Event('bldesk:templates-changed'))
    } catch (err: any) { setStoreUnreadable(isTemplateStoreUnreadable(err)); setError(err.message || 'Could not save template.') }
  }

  const copyYaml = async () => {
    try {
      const document = templateYaml({ name: name.trim(), description: description.trim(), created_at: draftMeta?.created_at || new Date().toISOString(), source: draftMeta?.source, user_data: userData })
      await navigator.clipboard.writeText(document)
      setError('Template YAML copied to the clipboard.')
    } catch (err: any) { setError(err.message || 'Could not copy template YAML.') }
  }

  const resetUnreadableStore = async () => {
    const result = await confirmAction({ title: 'Reset stored cloud-init templates', target: { kind: 'account', name: 'this device' }, summary: 'Discard the unreadable stored template data on this device.', severity: 'destructive', confirmLabel: 'Reset stored templates', log: false })
    if (!result.ok) return
    try {
      resetTemplateStorage()
      setSelected(null)
      setItems([])
      setStoreUnreadable(false)
      setError('Unreadable stored templates were reset.')
      window.dispatchEvent(new Event('bldesk:templates-changed'))
    } catch (err: any) { setError(err.message || 'Could not reset stored templates.') }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 overlay-safe">
      <div className="w-full max-w-5xl max-h-full overflow-y-auto rounded-lg bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#495057] shadow-xl panel-safe">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white dark:bg-[#2b3035] border-b border-[#ced4da] dark:border-[#495057]">
          <div><h2 className="font-bold text-[#212529] dark:text-white">Cloud-init templates</h2><p className="text-xs text-[#6c757d]">Stored in plain text on this device.</p></div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="grid md:grid-cols-[240px_1fr] gap-4 p-4">
          <aside className="space-y-2">
            <button onClick={() => { setSelected(null); setName(''); setDescription(''); setUserData('#cloud-config\n'); setDraftMeta(null) }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[#017cb6] text-white text-xs"><Plus className="w-4 h-4" />New from text</button>
            {items.map((item) => <button key={item.slug} onClick={() => choose(item)} className={`w-full text-left px-3 py-2 rounded border text-xs ${selected === item.slug ? 'border-[#017cb6] bg-[#017cb6]/10' : 'border-[#ced4da] dark:border-[#495057]'}`}><b className="block text-[#212529] dark:text-white">{item.template?.name || item.slug}</b><span title={!item.template ? item.error : undefined} className={item.template ? 'text-[#6c757d]' : 'text-rose-600'}>{item.template ? item.template.description || 'No description' : item.errorCode === 'too_large' ? 'Invalid: too large' : item.errorCode === 'unreadable' ? 'Unreadable file' : item.errorCode === 'invalid' ? 'Invalid YAML' : 'Could not read'}</span></button>)}
            {!items.length && <p className="text-xs text-[#6c757d]">No saved templates yet.</p>}
          </aside>
          <main className="space-y-3">
            <input autoFocus={!!initialDraft} value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="w-full px-3 py-2 text-sm rounded border bg-transparent border-[#ced4da] dark:border-[#495057]" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full px-3 py-2 text-sm rounded border bg-transparent border-[#ced4da] dark:border-[#495057]" />
            <textarea value={userData} onChange={(e) => setUserData(e.target.value)} rows={12} spellCheck={false} className="w-full px-3 py-2 text-xs font-mono rounded border bg-[#f8f9fa] dark:bg-[#212529] border-[#ced4da] dark:border-[#495057]" />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={save} className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#017cb6] text-white text-xs"><Save className="w-4 h-4" />Save</button>
              <button onClick={() => void copyYaml()} className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs"><Copy className="w-4 h-4" />Copy YAML</button>
              <button onClick={async () => { try { const imported = parseTemplate(await navigator.clipboard.readText()); setSelected(null); setName(imported.name); setDescription(imported.description); setUserData(imported.user_data); setDraftMeta({ created_at: imported.created_at, source: imported.source }); setError('Imported from clipboard. Review and save it.') } catch (err: any) { setError(err.message || 'Clipboard does not contain a valid template.') } }} className="px-3 py-2 rounded border text-xs">Paste YAML</button>
              {selected && <button onClick={async () => { try { if (!(await revealTemplate(selected))) setError('File reveal is available in the desktop app only.') } catch (err: any) { setError(err.message || 'Could not reveal the template file.') } }} className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs"><ExternalLink className="w-4 h-4" />Reveal YAML file</button>}
              {selected && <button onClick={async () => { const item = items.find((candidate) => candidate.slug === selected); const label = item?.template?.name || selected; const result = await confirmAction({ title: 'Delete cloud-init template', target: { kind: 'account', name: label }, summary: `Delete the local template “${label}” from this device.`, severity: 'destructive', confirmLabel: 'Delete template', log: false }); if (!result.ok) return; try { await removeTemplate(selected); setSelected(null); await refresh(null); window.dispatchEvent(new Event('bldesk:templates-changed')) } catch (err: any) { setStoreUnreadable(isTemplateStoreUnreadable(err)); setError(err.message || 'Could not delete the template.') } }} className="flex items-center gap-1.5 px-3 py-2 rounded border border-rose-400 text-rose-600 text-xs"><Trash2 className="w-4 h-4" />Delete</button>}
              {storeUnreadable && <button onClick={() => void resetUnreadableStore()} className="flex items-center gap-1.5 px-3 py-2 rounded border border-rose-400 text-rose-600 text-xs"><Trash2 className="w-4 h-4" />Reset stored templates</button>}
            </div>
          </main>
        </div>
        {servers.length > 0 && <div className="p-4 border-t border-[#ced4da] dark:border-[#495057] overflow-x-auto">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-sm">Fleet cloud-init coverage</h3><button onClick={() => setShowFleet((shown) => !shown)} className="px-3 py-1.5 rounded border text-xs">{showFleet ? 'Hide coverage' : 'Check fleet coverage'}</button></div>
          {showFleet && <>
            {fleet.isError && <p className="mt-2 text-xs text-rose-600">{fleet.error instanceof Error ? fleet.error.message : 'Could not check fleet user data.'}</p>}
            <table className="w-full text-xs mt-2"><thead><tr className="text-left text-[#6c757d]"><th className="py-2">Server</th><th>Image</th><th>Supports user data</th><th>Stored user data</th></tr></thead><tbody>{servers.map((server) => { const supported = imageSupportsUserData(server.image); const value = supported ? fleet.data?.get(server.id) : null; return <tr key={server.id} className="border-t border-[#ced4da] dark:border-[#495057]"><td className="py-2">{server.name}</td><td>{server.image?.name || server.image?.slug || 'Unknown'}</td><td>{supported ? 'Yes' : 'No'}</td><td>{!supported ? 'No' : fleet.isLoading ? 'Checking…' : value === undefined ? 'Unavailable' : value ? 'Yes' : 'No'}</td></tr> })}</tbody></table>
          </>}
        </div>}
      </div>
    </div>
  )
}
