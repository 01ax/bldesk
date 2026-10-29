import { Capacitor, registerPlugin } from '@capacitor/core'

/** The Android app's own plugin (android/app/src/main/java/com/termau/bldesk/FileSavePlugin.java): Android's "Save as" dialog. */
interface FileSavePlugin {
  saveText(options: { filename: string; text: string; mimeType?: string }): Promise<{ saved: boolean; name?: string }>
}
const FileSave = registerPlugin<FileSavePlugin>('FileSave')

export interface SaveResult {
  /** Whether the file was saved. `null` when it was handed to the browser's download, which cannot say. */
  saved: boolean | null
  /** The name the file was saved under, when the system says (the Android app only). */
  name?: string
}

/**
 * Save `text` as a file the person keeps. The Android app opens Android's "Save as" dialog, because a WebView ignores a
 * download link; the desktop app and the browser build download it, which asks where to put it or saves it as the
 * browser is set to. Rejects if the file could not be written.
 */
export async function saveTextFile(filename: string, text: string, mimeType = 'application/json'): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    const result = await FileSave.saveText({ filename, text, mimeType })
    return { saved: result.saved, name: result.name }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { saved: null }
}
