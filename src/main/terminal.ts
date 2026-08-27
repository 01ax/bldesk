import { spawn } from 'child_process'
import { TerminalLaunchOptions } from '../shared/ipc-types'

export function launchNativeTerminal(options: TerminalLaunchOptions): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const user = options.username || 'root'
    const port = options.port ? `-p ${options.port}` : ''
    const key = options.privateKeyPath ? `-i "${options.privateKeyPath}"` : ''
    const sshCmd = `ssh ${user}@${options.host} ${port} ${key}`.trim()

    const platform = process.platform

    try {
      if (platform === 'win32') {
        // Try launching Windows Terminal (wt.exe), fallback to PowerShell / cmd
        const wtProcess = spawn('wt.exe', ['new-tab', '-p', 'PowerShell', 'ssh', `${user}@${options.host}`, ...(options.port ? ['-p', String(options.port)] : [])], {
          detached: true,
          stdio: 'ignore'
        })

        wtProcess.on('error', () => {
          // Fallback to powershell.exe with -NoExit
          spawn('cmd.exe', ['/c', 'start', 'powershell', '-NoExit', '-Command', sshCmd], {
            detached: true,
            stdio: 'ignore'
          })
        })

        return resolve({ success: true })
      } else if (platform === 'darwin') {
        // macOS: Launch Terminal.app or iTerm2 via osascript
        const script = `tell application "Terminal" to do script "${sshCmd}" activate`
        spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' })
        return resolve({ success: true })
      } else {
        // Linux: x-terminal-emulator, gnome-terminal, or xterm
        const term = spawn('x-terminal-emulator', ['-e', sshCmd], { detached: true, stdio: 'ignore' })
        term.on('error', () => {
          spawn('gnome-terminal', ['--', 'bash', '-c', `${sshCmd}; exec bash`], { detached: true, stdio: 'ignore' })
        })
        return resolve({ success: true })
      }
    } catch (err: any) {
      console.error('[Terminal] Failed to spawn native terminal:', err)
      return resolve({ success: false, error: err.message })
    }
  })
}
