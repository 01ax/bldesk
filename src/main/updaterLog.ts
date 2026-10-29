import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs'
import { dirname } from 'path'
import { format } from 'util'

/**
 * The updater's log file. The updater's console output is lost whenever BLDesk was started by something that does not
 * keep it: an instance restarted after an update has its output discarded, so nothing explained what a later check or
 * install did. Every line goes here as well, in the user-data folder, and the install helper appends to the same file.
 */

/** When the file grows past this, the next write moves it to `<name>.1`, replacing any older one. */
export const MAX_UPDATER_LOG_BYTES = 512 * 1024
const MAX_LINE_CHARS = 4000

/** One log entry: an ISO time in UTC, the level, then the message. A multi-line message keeps its lines, indented, so every entry starts with a time. */
export function formatUpdaterLogLine(now: Date, level: string, parts: unknown[]): string {
  let text = format(...(parts as [unknown, ...unknown[]]))
  if (text.length > MAX_LINE_CHARS) text = `${text.slice(0, MAX_LINE_CHARS)}… (${text.length - MAX_LINE_CHARS} more characters)`
  return `${now.toISOString()} ${level.padEnd(5)} ${text.replace(/\r?\n/g, '\n      ')}`
}

/** Append an entry, rotating first when the file is large. Never throws: logging must not be able to break an update. Returns whether it was written. */
export function appendUpdaterLog(
  path: string,
  level: string,
  parts: unknown[],
  now: Date = new Date(),
  maxBytes: number = MAX_UPDATER_LOG_BYTES
): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    try {
      if (statSync(path).size > maxBytes) renameSync(path, `${path}.1`)
    } catch {
      // no file yet
    }
    appendFileSync(path, `${formatUpdaterLogLine(now, level, parts)}\n`, { mode: 0o600 })
    return true
  } catch {
    return false
  }
}
