import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

// Keep text useful at the small end and the responsive layout usable at the
// large end, including at the desktop window's 1024 × 680 minimum size.
const ZOOM_FACTORS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]
type ZoomAction = 'in' | 'out' | 'reset'

function changeZoom(window: BrowserWindow | null, action: ZoomAction): void {
  if (!window || window.isDestroyed()) return
  const contents = window.webContents
  const current = contents.getZoomFactor()
  const next = action === 'reset'
    ? 1
    : action === 'in'
      ? ZOOM_FACTORS.find((factor) => factor > current + 0.001) ?? ZOOM_FACTORS[ZOOM_FACTORS.length - 1]
      : [...ZOOM_FACTORS].reverse().find((factor) => factor < current - 0.001) ?? ZOOM_FACTORS[0]
  contents.setZoomFactor(next)
}

export function installWindowZoom(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return
    const action = input.key === '+' || input.key === '=' || input.code === 'NumpadAdd'
      ? 'in'
      : input.key === '-' || input.code === 'NumpadSubtract'
        ? 'out'
        : input.key === '0' || input.code === 'Numpad0'
          ? 'reset'
          : null
    if (!action) return
    // Also stop the application menu accelerator, otherwise one press can zoom twice.
    event.preventDefault()
    changeZoom(window, action)
  })

  window.webContents.on('zoom-changed', (event, direction) => {
    event.preventDefault()
    changeZoom(window, direction)
  })
}

export function installZoomMenu(): void {
  // Built-in zoom roles ignore custom click handlers and would bypass the
  // limits. Keep standard application menus, with bounded View commands.
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => changeZoom(BrowserWindow.getFocusedWindow(), 'reset') },
        { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => changeZoom(BrowserWindow.getFocusedWindow(), 'in') },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => changeZoom(BrowserWindow.getFocusedWindow(), 'out') },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
