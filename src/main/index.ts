import { app, shell, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { VaultManager } from './safeStorage'
import { launchNativeTerminal } from './terminal'
import { ConsoleWindowOptions, SystemNotificationOptions, TerminalLaunchOptions } from '../shared/ipc-types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false, // Frameless window with custom modern titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#020617', // slate-950
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    // Generate a simple 16x16 icon in memory or use asset
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'BLDesk - BinaryLane Cloud', enabled: false },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
          } else {
            createWindow()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit BLDesk',
        click: () => {
          app.quit()
        }
      }
    ])
    tray.setToolTip('BLDesk - BinaryLane Desktop')
    tray.setContextMenu(contextMenu)
  } catch (err) {
    console.warn('[Tray] Failed to initialize tray:', err)
  }
}

function registerIpcHandlers(): void {
  // Vault & Auth
  ipcMain.handle('vault:getProfiles', async () => VaultManager.getProfiles())
  ipcMain.handle('vault:getActiveProfile', async () => VaultManager.getActiveProfile())
  ipcMain.handle('vault:saveProfile', async (_, profile) => VaultManager.saveProfile(profile))
  ipcMain.handle('vault:setActiveProfile', async (_, profileId) => VaultManager.setActiveProfile(profileId))
  ipcMain.handle('vault:deleteProfile', async (_, profileId) => VaultManager.deleteProfile(profileId))

  // Terminal & Console
  ipcMain.handle('terminal:launchNative', async (_, options: TerminalLaunchOptions) => {
    return launchNativeTerminal(options)
  })

  ipcMain.handle('console:openRescue', async (_, options: ConsoleWindowOptions) => {
    const consoleWindow = new BrowserWindow({
      width: options.width || 1024,
      height: options.height || 768,
      title: `Rescue Console - ${options.serverName} (#${options.serverId})`,
      backgroundColor: '#000000',
      autoHideMenuBar: true
    })
    consoleWindow.loadURL(options.url)
    return { success: true }
  })

  // Notifications
  ipcMain.handle('system:sendNotification', async (_, options: SystemNotificationOptions) => {
    if (Notification.isSupported()) {
      new Notification({ title: options.title, body: options.body }).show()
    }
  })

  // Window Controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  // External Links
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.termau.bldesk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
