import { Capacitor, registerPlugin } from '@capacitor/core'

/** The Android app's own plugin (android/app/src/main/java/com/termau/bldesk/FileSavePlugin.java): Android's "Save as" dialog. */
export interface FileSavePlugin {
  saveText(options: { filename: string; text: string; mimeType?: string }): Promise<{ saved: boolean; name?: string }>
  /** One piece of the bytes of the file `id`, as base64, for `saveStaged`; `first` starts the file over. */
  stageBase64(options: { id: string; base64: string; first?: boolean }): Promise<void>
  /** The same dialog for the file `id` staged with `stageBase64`. */
  saveStaged(options: { id: string; filename: string; mimeType?: string }): Promise<{ saved: boolean; name?: string }>
}
const FileSave = registerPlugin<FileSavePlugin>('FileSave')

export interface SaveResult {
  /** Whether the file was saved. `null` when it was handed to the browser's download, which cannot say. */
  saved: boolean | null
  /** The name the file was saved under, when the system says (the Android app only). */
  name?: string
}

/**
 * Longest text (in characters) the plugin is given in the one call that opens the dialog. Capacitor keeps that call's
 * options in the activity's saved state, twice over and as UTF-16, and Android closes the app when the dialog opens if
 * the state is more than about a megabyte. A longer text is saved as bytes instead (`saveBlobFile`), which are not.
 */
const INLINE_TEXT_MAX = 100_000

/** Longest piece of base64 handed to the plugin in one call. A multiple of four, so each piece decodes on its own. */
const PIECE = 256 * 1024

/** Hand a file to the browser's download: the desktop app and the browser build. */
function downloadBlob(filename: string, blob: Blob): SaveResult {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { saved: null }
}

/**
 * The bytes of `blob` as base64, for the plugin (a Capacitor call carries JSON, which has no bytes). Built a slice at a
 * time: `String.fromCharCode(...bytes)` on a whole image overflows the call stack. A slice is a multiple of three
 * bytes, so each encodes to base64 without padding and the pieces join into the encoding of the whole.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const SLICE = 3 * 4096
  const parts: string[] = []
  for (let at = 0; at < bytes.length; at += SLICE) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(at, at + SLICE))))
  }
  return parts.join('')
}

/**
 * The two save functions, over a plugin and a test for "is this the Android app". `saveTextFile` and `saveBlobFile`
 * below are these over the real plugin; the tests give it a fake one.
 *
 * In the Android app a save is one transaction with the plugin (the text call; or the pieces and then the dialog), and
 * transactions take turns, first come first served, whoever asks: every export on every screen goes through the one
 * saver, so the turn is held across components and remounts. The plugin cannot do two at once. It holds one dialog's
 * answer at a time, because Capacitor hands the result of a dialog to the last call that opened one, so a second dialog
 * opened while the first is open takes the first's answer and leaves the first call waiting for ever; and the bytes of
 * a file wait in the plugin until its dialog is answered, so the pieces of a second file arriving then could replace them.
 * A transaction that fails, or whose dialog is backed out of, gives its turn up like one that succeeds. The browser
 * download needs none of this and does not wait.
 */
export function createFileSaver(plugin: FileSavePlugin, isNative: () => boolean) {
  let last: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(transaction: () => Promise<T>): Promise<T> => {
    const mine = last.then(transaction)
    // The next one starts when this settles either way: a rejection is for this caller, not for the ones behind it.
    last = mine.then(
      () => undefined,
      () => undefined
    )
    return mine
  }

  let files = 0
  /** The pieces, then the dialog. Only inside a turn. */
  const stageAndSave = async (filename: string, blob: Blob): Promise<SaveResult> => {
    // In pieces, then the dialog: see FileSavePlugin.stageBase64 for why the bytes cannot go in the call that opens it.
    const id = `${Date.now().toString(36)}-${++files}`
    const base64 = await blobToBase64(blob)
    for (let at = 0; at === 0 || at < base64.length; at += PIECE) {
      await plugin.stageBase64({ id, base64: base64.slice(at, at + PIECE), first: at === 0 })
    }
    const result = await plugin.saveStaged({ id, filename, mimeType: blob.type || 'application/octet-stream' })
    return { saved: result.saved, name: result.name }
  }

  /**
   * Save `text` as a file the person keeps. The Android app opens Android's "Save as" dialog, because a WebView ignores
   * a download link; the desktop app and the browser build download it, which asks where to put it or saves it as the
   * browser is set to. Rejects if the file could not be written.
   */
  async function saveTextFile(filename: string, text: string, mimeType = 'application/json'): Promise<SaveResult> {
    if (!isNative()) return downloadBlob(filename, new Blob([text], { type: mimeType }))
    return inTurn(async () => {
      if (text.length > INLINE_TEXT_MAX) return stageAndSave(filename, new Blob([text], { type: mimeType }))
      const result = await plugin.saveText({ filename, text, mimeType })
      return { saved: result.saved, name: result.name }
    })
  }

  /**
   * Save a binary file (an image, say) as `saveTextFile` saves text: Android's "Save as" dialog in the Android app, the
   * browser's download everywhere else. The type is the blob's own. Rejects if the file could not be written.
   */
  async function saveBlobFile(filename: string, blob: Blob): Promise<SaveResult> {
    if (!isNative()) return downloadBlob(filename, blob)
    return inTurn(() => stageAndSave(filename, blob))
  }

  return { saveTextFile, saveBlobFile }
}

const saver = createFileSaver(FileSave, () => Capacitor.isNativePlatform())
export const saveTextFile = saver.saveTextFile
export const saveBlobFile = saver.saveBlobFile
