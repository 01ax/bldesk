import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const { version: APP_VERSION } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

// Plugin to strip `crossorigin` attributes so Chromium allows file:// script loading in packaged Electron
function removeCrossoriginPlugin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(?:="[^"]*"|='[^']*'|(?=[\s>]))?/g, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    base: './',
    /*
     * Vite's default 5173 is unusable on Windows machines with Hyper-V or WSL:
     * those reserve blocks of ports, and 5173 falls inside 5141-5240 on at least
     * one dev box, so `npm run dev` dies with EACCES before the window opens.
     * Overridable rather than moved, so the default stays familiar.
     */
    server: {
      port: Number(process.env.BLDESK_DEV_PORT) || 5173,
      fs: { allow: [resolve('.')] },
      strictPort: false
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@help': resolve('docs/help'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), removeCrossoriginPlugin()]
  }
})
