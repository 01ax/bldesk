import { contextBridge, ipcRenderer } from 'electron'
import { IpcApi, UpdaterState } from '../shared/ipc-types'
import { cleanIpcError } from '../shared/ipcErrors'

// Every call to the main process goes through here, so a failure reaches the screens as its reason alone: Electron
// prefixes it with "Error invoking remote method '<channel>': Error: ".
const invoke = async (channel: string, ...args: unknown[]): Promise<any> => {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    throw new Error(cleanIpcError(err instanceof Error ? err.message : String(err)))
  }
}

const api: IpcApi = {
  helpAsk: (question) => invoke('help:ask', question),
  helpSuggest: (prefix) => invoke('help:suggest', prefix),
  helpFeedback: (id, helpful) => invoke('help:feedback', id, helpful),
  // Vault & Auth
  getProfiles: () => invoke('vault:getProfiles'),
  getActiveProfile: () => invoke('vault:getActiveProfile'),
  saveProfile: (profile) => invoke('vault:saveProfile', profile),
  deleteProfile: (profileId) => invoke('vault:deleteProfile', profileId),
  setActiveProfile: (profileId) => invoke('vault:setActiveProfile', profileId),

  // Terminal & Console
  pty: {
    open: (options) => invoke('pty:open', options),
    write: (id, data) => invoke('pty:write', id, data),
    resize: (id, cols, rows) => invoke('pty:resize', id, cols, rows),
    close: (id) => invoke('pty:close', id),
    list: () => invoke('pty:list'),
    onData: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, id: string, chunk: string) => cb(id, chunk)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, id: string, code: number, signal?: number) => cb(id, code, signal)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    }
  },
  launchNativeTerminal: (options) => invoke('terminal:launchNative', options),
  openRescueConsole: (options) => invoke('console:openRescue', options),

  // SSH Keys
  getLocalSshKeys: (paths) => invoke('vault:getLocalSshKeys', paths),
  chooseSshKeyFile: () => invoke('vault:chooseSshKeyFile'),
  generateSshKeyPair: (request) => invoke('vault:generateSshKeyPair', request),
  showSshKeyInFolder: (privateKeyPath) => invoke('vault:showSshKeyInFolder', privateKeyPath),

  // System Notifications
  sendNotification: (options) => invoke('system:sendNotification', options),

  // Local change log
  changelogAppend: (entry) => invoke('changelog:append', entry),
  changelogUpdate: (profileId, id, patch) => invoke('changelog:update', profileId, id, patch),
  changelogList: (profileId, limit) => invoke('changelog:list', profileId, limit),
  changelogClear: (profileId) => invoke('changelog:clear', profileId),

  // Device-wide cloud-init templates
  templatesList: () => invoke('templates:list'),
  templatesGet: (slug) => invoke('templates:get', slug),
  templatesSave: (document, oldSlug) => invoke('templates:save', document, oldSlug),
  templatesRemove: (slug) => invoke('templates:remove', slug),
  templatesReveal: (slug) => invoke('templates:reveal', slug),

  // Tray / menu bar
  updateTray: (summary) => invoke('tray:update', summary),
  getTraySettings: () => invoke('tray:getSettings'),

  // Window Controls
  platform: process.platform,
  onWindowMaximized: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized)
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },
  minimizeWindow: () => invoke('window:minimize'),
  maximizeWindow: () => invoke('window:maximize'),
  closeWindow: () => invoke('window:close'),
  isMaximized: () => invoke('window:isMaximized'),

  // External Links
  openExternal: (url) => invoke('shell:openExternal', url),
  probeTcp: (host: string, port: number, timeoutMs?: number) =>
    invoke('net:probeTcp', host, port, timeoutMs),
  probePing: (host: string, timeoutMs?: number) => invoke('net:probePing', host, timeoutMs),
  traceroute: (host: string, maxHops?: number) => invoke('net:traceroute', host, maxHops),
  setProbeTargets: (ips: string[]) => invoke('net:setTargets', ips),

  // Auto-update
  getUpdaterState: () => invoke('updater:getState'),
  checkForUpdates: () => invoke('updater:check'),
  installUpdate: () => invoke('updater:install'),
  setUpdateChannel: (channel) => invoke('updater:setChannel', channel),
  onUpdaterState: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, state: UpdaterState) => listener(state)
    ipcRenderer.on('updater:state', handler)
    return () => ipcRenderer.removeListener('updater:state', handler)
  },

  // Deep links (bldesk://)
  getPendingDeepLink: () => invoke('deeplink:getPending'),
  deepLinkReady: () => invoke('deeplink:ready'),
  onDeepLink: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => listener(url)
    ipcRenderer.on('deeplink:open', handler)
    return () => ipcRenderer.removeListener('deeplink:open', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('bldeskApi', api)
  } catch (error) {
    console.error('Failed to expose bldeskApi in main world:', error)
  }
} else {
  // @ts-ignore (define in window)
  window.bldeskApi = api
}
