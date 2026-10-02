/**
 * Server tags, tag colours, groups and target matching, as plain data and pure functions. A tag is a lower-case name a
 * server can carry, kept locally per account profile (the BinaryLane API has no tags), and a colour belongs to the tag
 * NAME. This file has no imports so its tests run directly (scripts/test-server-tags.mjs); reading and writing them
 * lives in serverGroups.ts, and commands.ts re-exports the matching.
 *
 * Two namespaces, always explicit: plain text in a target or a search is a SERVER (name, IP, #id), never a tag; `@x`
 * is a tag or saved group, never a server name.
 */

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** serverId → tags. A tag is also a group: every server tagged `web` is in `@web`. */
export type TagMap = Record<number, string[]>

// ---------------------------------------------------------------------------
// Maps keyed by a name
//
// A tag's name is whatever someone typed once it has been through normaliseTag, so it can be `constructor` or
// `__proto__`. In an ordinary object those are the object's own inherited members, so `colors['constructor']` is a
// function and `colors['__proto__'] = 'red'` changes the prototype instead of storing a colour. Every map keyed by a
// tag name here has no prototype (Object.create(null)) and is read with an own-property check (colorOf), and what
// comes out of storage is rebuilt key by key (cleanTagMap, cleanTagColors), never taken as it was parsed.
// ---------------------------------------------------------------------------

const hasOwnProp = Object.prototype.hasOwnProperty

/** Whether `key` is a property of the object itself, not one it inherits. */
export function hasOwn(obj: object, key: string): boolean {
  return hasOwnProp.call(obj, key)
}

export function newTagMap(): TagMap {
  return Object.create(null) as TagMap
}

export function newColorMap(): TagColorMap {
  return Object.create(null) as TagColorMap
}

/** A copy that is safe to write any tag name into. */
export function copyTagMap(m: TagMap): TagMap {
  const out = newTagMap()
  for (const k of Object.keys(m)) out[k as unknown as number] = m[k as unknown as number]
  return out
}

export function copyColorMap(m: TagColorMap): TagColorMap {
  const out = newColorMap()
  for (const k of Object.keys(m)) out[k] = m[k]
  return out
}

/** A tag's colour (a preset key or a `#rrggbb`), or `undefined` when it has none: only the map's own entries count. */
export function colorOf(colors: TagColorMap | null | undefined, tag: string): string | undefined {
  if (!colors || typeof tag !== 'string' || !hasOwn(colors, tag)) return undefined
  const value = colors[tag]
  return isTagColorValue(value) ? value : undefined
}

/**
 * Stored tags, as read: server ids that are whole numbers mapped to lists of tag names that are already in their
 * normalised form (anything else is dropped), without repeats. Anything that is not an object, and every key or value
 * of the wrong kind, is left out, so a tampered or damaged store cannot put a value in that the app would trip over.
 */
export function cleanTagMap(raw: unknown): TagMap {
  const out = newTagMap()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const key of Object.keys(raw)) {
    if (!/^\d+$/.test(key) || !Number.isSafeInteger(Number(key))) continue
    const list = (raw as Record<string, unknown>)[key]
    if (!Array.isArray(list)) continue
    const names = [...new Set(list.filter((t): t is string => typeof t === 'string' && t !== '' && normaliseTag(t) === t))]
    out[Number(key)] = names
  }
  return out
}

/**
 * Stored tag colours, as read: tag names in normalised form mapped to a preset key or a lower-case `#rrggbb`, nothing
 * else (so no `url(...)`, no upper case, no object). The result has no prototype, so `__proto__` and `constructor`
 * are tag names like any other.
 */
export function cleanTagColors(raw: unknown): TagColorMap {
  const out = newColorMap()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const tag of Object.keys(raw)) {
    const value = (raw as Record<string, unknown>)[tag]
    if (tag !== '' && normaliseTag(tag) === tag && isTagColorValue(value)) out[tag] = value
  }
  return out
}

export function normaliseTag(tag: string): string {
  return tag.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '')
}

/** Why a typed tag name cannot be used, or `null` if it can. */
export function tagNameProblem(raw: string): string | null {
  if (normaliseTag(raw)) return null
  return raw.trim()
    ? `"${raw.trim()}" has no usable characters. A tag is letters, numbers, dots, dashes and underscores.`
    : 'Type a tag name: letters, numbers, dots, dashes and underscores.'
}

export function tagsOf(tags: TagMap, serverId: number): string[] {
  return tags[serverId] ?? []
}

/** Returns the new map; never mutates. */
export function withTag(tags: TagMap, serverIds: number[], tag: string, present: boolean): TagMap {
  const t = normaliseTag(tag)
  if (!t) return tags
  const next = copyTagMap(tags)
  for (const id of serverIds) {
    const cur = new Set(next[id] ?? [])
    if (present) cur.add(t)
    else cur.delete(t)
    if (cur.size) next[id] = [...cur].sort()
    else delete next[id]
  }
  return next
}

/** Every tag in use, with how many servers carry it. */
export function allTags(tags: TagMap): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const list of Object.values(tags)) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
}

/** How many servers carry a tag, counting only `liveIds` when given (the tags of deleted servers stay in the store). */
export function tagServerCount(tags: TagMap, tag: string, liveIds?: ReadonlySet<number>): number {
  let n = 0
  for (const [id, list] of Object.entries(tags)) if (list.includes(tag) && (!liveIds || liveIds.has(Number(id)))) n++
  return n
}

/**
 * The tags in use on servers that exist (`liveIds`), with how many servers carry each, alphabetical without regard to
 * case. A tag whose servers are all gone is left out. The Servers page's tag filter and its `@` suggestions, and the
 * command palette's tag rows, all take their list from here so they agree.
 */
export function liveTagCounts(tags: TagMap, liveIds: ReadonlySet<number>): Array<{ tag: string; count: number }> {
  return allTags(tags)
    .map(({ tag }) => ({ tag, count: tagServerCount(tags, tag, liveIds) }))
    .filter((t) => t.count > 0)
    .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * The colour presets: one key per colour, kept in tag-colour storage. A tag's colour is a preset key or, for a custom
 * colour, a `#rrggbb` string; the stored values are never class names, so the look can change without touching what
 * people saved.
 */
export const TAG_COLOR_KEYS = ['slate', 'blue', 'teal', 'green', 'amber', 'red', 'purple', 'pink'] as const
export type TagColorKey = (typeof TAG_COLOR_KEYS)[number]
/** What each preset's swatch looks like, as a hex colour: used to tell colours apart and to tell a custom colour that is a preset. */
export const TAG_PRESET_HEX: Record<TagColorKey, string> = {
  slate: '#64748b',
  blue: '#2563eb',
  teal: '#0d9488',
  green: '#16a34a',
  amber: '#f59e0b',
  red: '#dc2626',
  purple: '#9333ea',
  pink: '#db2777'
}
/** tag name → a preset key or a `#rrggbb` hex. A tag without an entry has the default look. */
export type TagColorMap = Record<string, string>

export function isTagColorKey(value: unknown): value is TagColorKey {
  return typeof value === 'string' && (TAG_COLOR_KEYS as readonly string[]).includes(value)
}

/** `#rgb`, `#rrggbb`, with or without the `#`, any case → `#rrggbb` lower-case; `null` when it is not a colour. */
export function normaliseHex(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) return '#' + [...s].map((c) => c + c).join('')
  if (/^[0-9a-f]{6}$/.test(s)) return '#' + s
  return null
}

/** Why a typed colour cannot be used, or `null` if it can. */
export function hexProblem(raw: string): string | null {
  if (normaliseHex(raw)) return null
  return typeof raw === 'string' && raw.trim()
    ? `"${raw.trim()}" is not a colour. Use 3 or 6 hex digits, such as #1e90ff.`
    : 'Type a colour as 3 or 6 hex digits, such as #1e90ff.'
}

/** A stored colour is a preset key or a `#rrggbb` hex. */
export function isTagColorValue(value: unknown): value is string {
  return isTagColorKey(value) || (typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value))
}

/** The form colours are compared in: a hex that is a preset's colour is that preset; a hex is lower-case `#rrggbb`. */
export function canonicalColor(color: string): string {
  if (typeof color !== 'string') return ''
  if (isTagColorKey(color)) return color
  const hex = normaliseHex(color)
  if (!hex) return color
  const preset = TAG_COLOR_KEYS.find((k) => TAG_PRESET_HEX[k] === hex)
  return preset ?? hex
}

/** The colour as `#rrggbb`, whether it is a preset key or a hex; `null` for anything else. */
export function colorHex(color: string): string | null {
  if (typeof color !== 'string') return null
  if (isTagColorKey(color)) return TAG_PRESET_HEX[color]
  return normaliseHex(color)
}

/** Returns the new map; `null` clears the tag's colour. */
export function withTagColor(colors: TagColorMap, tag: string, color: string | null): TagColorMap {
  const next = copyColorMap(colors)
  if (color) next[tag] = canonicalColor(color)
  else delete next[tag]
  return next
}

/** The colours of tags no server carries any more are dropped: a colour is a property of a tag in use. */
export function pruneTagColors(colors: TagColorMap, tags: TagMap): TagColorMap {
  const used = new Set(Object.values(tags).flat())
  const out = newColorMap()
  for (const tag of Object.keys(colors)) if (used.has(tag)) out[tag] = colors[tag]
  return out
}

/**
 * Rename a tag on every server that has it. A tag is one shared name (it is also the `@group` a target uses), so there
 * is no per-server rename. Renaming to a name already in use merges the two: a server with both keeps one. The colour
 * moves with the name; when the new name already has a colour, that one stays. Changes nothing when `to` has no
 * usable characters or is the same name.
 */
export function renameTag(
  tags: TagMap,
  colors: TagColorMap,
  from: string,
  to: string
): { tags: TagMap; colors: TagColorMap; renamed: number; merged: boolean } {
  const target = normaliseTag(to)
  if (!target || target === from) return { tags, colors, renamed: 0, merged: false }
  const merged = Object.values(tags).some((list) => list.includes(target))
  const next = newTagMap()
  let renamed = 0
  for (const [id, list] of Object.entries(tags)) {
    if (!list.includes(from)) {
      next[Number(id)] = list
      continue
    }
    renamed++
    next[Number(id)] = [...new Set(list.map((t) => (t === from ? target : t)))].sort()
  }
  const nextColors = copyColorMap(colors)
  const fromColor = colorOf(nextColors, from)
  if (fromColor && !colorOf(nextColors, target)) nextColors[target] = fromColor
  delete nextColors[from]
  return { tags: next, colors: nextColors, renamed, merged }
}

// --- colour maths ----------------------------------------------------------

export type Rgb = [number, number, number]
export type Rng = () => number

export function hexToRgb(hex: string): Rgb | null {
  const h = normaliseHex(hex)
  if (!h) return null
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')
}

/** h in degrees [0, 360), s and v in [0, 1]. */
export function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255]
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rf) h = ((gf - bf) / d) % 6
    else if (max === gf) h = (bf - rf) / d + 2
    else h = (rf - gf) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x]
  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)]
}

/** h in degrees, s and l in [0, 1]. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const v = l + s * Math.min(l, 1 - l)
  return hsvToRgb(h, v === 0 ? 0 : 2 * (1 - l / v), v)
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const blend = (fg: Rgb, alpha: number, bg: Rgb): Rgb => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as Rgb
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb
const css = ([r, g, b]: Rgb, a?: number) => (a === undefined ? `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})` : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${a})`)

/** What a chip sits on, per theme: the row, and the row while hovered (the text has to read on both). */
export const CHIP_SURFACES: Record<'light' | 'dark', Rgb[]> = {
  light: [[255, 255, 255], [248, 249, 250]],
  dark: [[43, 48, 53], [50, 56, 62]]
}
/** Strength of the tint behind the text and of the border, as a share of the colour over the row. */
export const CHIP_BG_ALPHA = 0.14
export const CHIP_BORDER_ALPHA = 0.4
/** The text is moved until it clears this, a little above the 4.5 the rule asks for, so rounding cannot take it below. */
export const CHIP_TEXT_TARGET = 4.6

export interface ChipStyle {
  /** CSS colours: the tint, the border and the text. */
  bg: string
  border: string
  text: string
  /** The lowest contrast of the text over the tint, over the surfaces it can sit on. */
  ratio: number
  /** The colour could not be moved far enough, so the text is black or white. */
  fellBack: boolean
}

function chipStyleFor(rgb: Rgb, surfaces: Rgb[], toward: Rgb): ChipStyle {
  const beds = surfaces.map((s) => blend(rgb, CHIP_BG_ALPHA, s))
  const worst = (text: Rgb) => Math.min(...beds.map((b) => contrastRatio(text, b)))
  const parts = { bg: css(rgb, CHIP_BG_ALPHA), border: css(rgb, CHIP_BORDER_ALPHA) }
  // The colour itself first, then lighter (dark theme) or darker (light theme) in small steps, keeping its hue.
  for (let i = 0; i <= 50; i++) {
    const text = mix(rgb, toward, i / 50)
    const ratio = worst(text)
    if (ratio >= CHIP_TEXT_TARGET) return { ...parts, text: css(text), ratio, fellBack: false }
  }
  const [white, black]: Rgb[] = [[255, 255, 255], [0, 0, 0]]
  const text = worst(white) >= worst(black) ? white : black
  return { ...parts, text: css(text), ratio: worst(text), fellBack: true }
}

/**
 * How a chip with a custom colour is drawn in each theme: the colour at about 14% over the row, a border at 40%, and
 * text that is the colour moved lighter (dark theme) or darker (light theme) until it reaches 4.5:1 against the tint
 * on the row and on the hovered row. A colour that cannot reach it even at white or black gets black or white text.
 * The presets keep their hand-picked classes (TagChip.tsx).
 */
export function customChipStyle(hex: string, surfaces: Record<'light' | 'dark', Rgb[]> = CHIP_SURFACES): { light: ChipStyle; dark: ChipStyle } | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return {
    light: chipStyleFor(rgb, surfaces.light, [0, 0, 0]),
    dark: chipStyleFor(rgb, surfaces.dark, [255, 255, 255])
  }
}

// --- the colour a new tag gets ---------------------------------------------

const rgbDistance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * The colour for a tag that is new: the first preset (in palette order) no tag in use has. When every preset is taken,
 * a random hue at a fixed saturation and lightness as a custom hex, one that is not in use and, where the draws allow,
 * is not close to any colour in use. Colours are compared as preset key or hex. `rng` returns [0, 1) and is
 * injectable so a test can pin it.
 */
export function pickAutoColor(inUse: Iterable<string>, rng: Rng = Math.random): string {
  const taken = new Set([...inUse].map(canonicalColor))
  for (const key of TAG_COLOR_KEYS) if (!taken.has(key)) return key
  const takenRgb = [...taken].map((c) => colorHex(c)).filter((h): h is string => !!h).map((h) => hexToRgb(h)!)
  let best = ''
  let bestDistance = -1
  for (let i = 0; i < 40; i++) {
    const hex = rgbToHex(hslToRgb(Math.floor(rng() * 360), 0.7, 0.5))
    if (taken.has(hex)) continue
    const rgb = hexToRgb(hex)!
    const d = takenRgb.length ? Math.min(...takenRgb.map((t) => rgbDistance(rgb, t))) : Infinity
    if (d >= 80) return hex
    if (d > bestDistance) {
      best = hex
      bestDistance = d
    }
  }
  return best || rgbToHex(hslToRgb(Math.floor(rng() * 360), 0.7, 0.5))
}

/**
 * Colours for the tags `next` has that `prev` did not (no server carried the name) and that have no stored colour; the
 * others are left exactly as they are. Colours of tags no server carries any more are dropped first, so a tag removed
 * from its last server frees its colour for the next new tag. A tag that already exists without a colour stays
 * without one.
 */
export function autoColorNewTags(prev: TagMap, next: TagMap, colors: TagColorMap, rng: Rng = Math.random): TagColorMap {
  const before = new Set(Object.values(prev).flat())
  const out = pruneTagColors(colors, next)
  const fresh = [...new Set(Object.values(next).flat())].filter((t) => !before.has(t) && !colorOf(out, t)).sort()
  for (const tag of fresh) out[tag] = pickAutoColor(Object.values(out), rng)
  return out
}

// --- saved custom colours ---------------------------------------------------

/** How many custom colours can be saved at once. */
export const MAX_CUSTOM_COLOURS = 8

/** `full`: all places are taken and `overwrite` was not asked for, so nothing was saved and the message is the question to ask. */
export type CustomColourStatus = 'added' | 'replaced' | 'invalid' | 'duplicate' | 'preset' | 'full'

/**
 * Add a custom colour to the saved list. The list is in the order the colours were saved, oldest first, and a new
 * colour goes at the end, which is the first empty place. A repeat or a preset's colour is not added. With every place
 * taken nothing is saved unless `overwrite` is true, and then the OLDEST saved colour is replaced; the caller asks
 * first, so a colour is never dropped without an explicit second request.
 */
export function addCustomColour(
  list: string[],
  raw: string,
  overwrite = false
): { list: string[]; status: CustomColourStatus; message: string } {
  const hex = normaliseHex(raw)
  if (!hex) return { list, status: 'invalid', message: hexProblem(raw) ?? '' }
  const preset = TAG_COLOR_KEYS.find((k) => TAG_PRESET_HEX[k] === hex)
  if (preset) return { list, status: 'preset', message: `${hex} is the ${preset} preset already.` }
  if (list.includes(hex)) return { list, status: 'duplicate', message: `${hex} is already saved.` }
  if (list.length >= MAX_CUSTOM_COLOURS) {
    if (!overwrite) return { list, status: 'full', message: 'Saving will overwrite the oldest saved colour. Click Save again to confirm.' }
    return { list: [...list.slice(1), hex], status: 'replaced', message: `Saved ${hex}, replacing the oldest, ${list[0]}.` }
  }
  return { list: [...list, hex], status: 'added', message: `Saved ${hex}.` }
}

export function removeCustomColour(list: string[], raw: string): string[] {
  const hex = normaliseHex(raw)
  return hex ? list.filter((c) => c !== hex) : list
}

/** Whatever was stored → a clean list: `#rrggbb` strings, no repeats, at most the limit. */
export function cleanCustomColours(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const hex = typeof v === 'string' ? normaliseHex(v) : null
    if (hex && !out.includes(hex)) out.push(hex)
  }
  return out.slice(0, MAX_CUSTOM_COLOURS)
}

// --- press and hold to remove a saved colour (the phone layout) ------------

/** Short vibrations while the finger is held, then one longer one when the colour is removed. */
export const HOLD_TICKS_MS = [400, 800, 1200] as const
/** How long the finger stays down before the colour is removed. */
export const HOLD_DELETE_MS = 1600
/** The finger moving further than this cancels the hold. */
export const HOLD_MOVE_TOLERANCE_PX = 8
export const HOLD_TICK_VIBRATION_MS = 25
export const HOLD_DELETE_VIBRATION_MS = 200

export interface HoldStep {
  /** Milliseconds after the finger went down. */
  at: number
  kind: 'tick' | 'delete'
  /** Length of the vibration for this step, in milliseconds. */
  vibrate: number
}

/** Everything that happens during a hold, in order: three ticks, then the removal. */
export function holdTimeline(): HoldStep[] {
  return [
    ...HOLD_TICKS_MS.map((at): HoldStep => ({ at, kind: 'tick', vibrate: HOLD_TICK_VIBRATION_MS })),
    { at: HOLD_DELETE_MS, kind: 'delete', vibrate: HOLD_DELETE_VIBRATION_MS }
  ]
}

/** How far through the hold it is, 0 to 1, for the ring that fills around the colour. */
export function holdProgress(elapsedMs: number): number {
  return Math.max(0, Math.min(1, elapsedMs / HOLD_DELETE_MS))
}

/** Whether the finger has moved far enough from where it went down to count as a drag, not a hold. */
export function holdMovedTooFar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > HOLD_MOVE_TOLERANCE_PX
}

// ---------------------------------------------------------------------------
// Searching and filtering by tag
// ---------------------------------------------------------------------------

/**
 * A search box's text as plain text and `@` tokens. Plain text is for servers (name, IP, #id) and never matches a
 * tag; a token starting with `@` is a tag prefix and never matches a server name. A lone `@` is the empty prefix,
 * which any tagged server matches.
 */
export function parseTagSearch(term: string): { plain: string; tagPrefixes: string[] } {
  const tokens = term.trim().split(/\s+/).filter(Boolean)
  return {
    plain: tokens.filter((t) => !t.startsWith('@')).join(' '),
    tagPrefixes: tokens.filter((t) => t.startsWith('@')).map((t) => t.slice(1).toLowerCase())
  }
}

/** Every prefix starts at least one of the server's tags (several `@` tokens are ANDed). */
export function matchesTagPrefixes(own: readonly string[], prefixes: readonly string[]): boolean {
  return prefixes.every((p) => own.some((t) => t.toLowerCase().startsWith(p)))
}

/**
 * Tags to offer while the last word of the search starts with `@`: those that start with it, case-insensitively, in the
 * order given, leaving out any already typed whole earlier in the search and the one just typed in full (there is
 * nothing left to complete; its servers are what the search lists). `limit` caps the list.
 */
export function tagSuggestions(term: string, inUse: ReadonlyArray<{ tag: string; count: number }>, limit = 8): Array<{ tag: string; count: number }> {
  if (!term || /\s$/.test(term)) return []
  const tokens = term.trim().split(/\s+/)
  const last = tokens[tokens.length - 1]
  if (!last.startsWith('@')) return []
  const prefix = last.slice(1).toLowerCase()
  const typed = new Set(tokens.slice(0, -1).filter((t) => t.startsWith('@')).map((t) => t.slice(1).toLowerCase()))
  return inUse.filter((t) => t.tag.toLowerCase().startsWith(prefix) && t.tag.toLowerCase() !== prefix && !typed.has(t.tag.toLowerCase())).slice(0, limit)
}

/** The search text with its last word replaced by `@tag` and a space after it. */
export function completeTagToken(term: string, tag: string): string {
  return term.replace(/\S*$/, `@${tag} `)
}

/** The tag filter: `any` keeps servers with at least one selected tag, `all` those with every one; no selection keeps all. */
export function matchesTagFilter(own: readonly string[], selected: readonly string[], mode: 'any' | 'all'): boolean {
  if (selected.length === 0) return true
  return mode === 'all' ? selected.every((t) => own.includes(t)) : selected.some((t) => own.includes(t))
}

// ---------------------------------------------------------------------------
// Targets and groups
// ---------------------------------------------------------------------------

/** What target matching needs of a server; the API's server type has it. */
export interface TargetServer {
  id: number
  name: string
  networks?: { v4?: Array<{ ip_address?: string }> | null } | null
}

export interface TargetMatchOf<S extends TargetServer = TargetServer> {
  server: S
  /** Which pattern in the list matched it, for the preview. */
  pattern: string
}

/**
 * Resolve a target expression to servers.
 *
 * Each comma-separated pattern is tried as, in order:
 *   `#123` / `123`   — server id
 *   `43.224.183.192` / `43.224` — a public IPv4 or a prefix of one (digits and dots only)
 *   `wp-*` / `web?`  — glob on the name, case-insensitive
 *   `jumpbox`        — exact name if one exists, otherwise a name prefix
 *
 * Tags are never consulted here: `@group` references are expanded to `#id` lists first (`expandGroupRefs`), and a
 * pattern that reaches this function names servers only, whatever characters it has.
 *
 * Returns matches in server-list order, de-duplicated, plus the patterns that
 * matched nothing so the UI can say so instead of quietly running on fewer
 * machines than the user meant.
 */
export function matchServers<S extends TargetServer>(servers: S[], expression: string): { matches: Array<TargetMatchOf<S>>; unmatched: string[] } {
  const seen = new Set<number>()
  const matches: Array<TargetMatchOf<S>> = []
  const unmatched: string[] = []

  for (const raw of expression.split(',')) {
    const pattern = raw.trim()
    if (!pattern) continue
    const hits = matchOne(servers, pattern)
    if (hits.length === 0) unmatched.push(pattern)
    for (const s of hits) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      matches.push({ server: s, pattern })
    }
  }
  // Keep server-list order regardless of pattern order so a preview reads like the list.
  const order = new Map(servers.map((s, i) => [s.id, i]))
  matches.sort((a, b) => (order.get(a.server.id) ?? 0) - (order.get(b.server.id) ?? 0))
  return { matches, unmatched }
}

function matchOne<S extends TargetServer>(servers: S[], pattern: string): S[] {
  const p = pattern.toLowerCase()

  if (/^#?\d+$/.test(p)) {
    const id = Number(p.replace(/^#/, ''))
    return servers.filter((s) => s.id === id)
  }

  if (/^[\d.]+$/.test(p) && p.includes('.')) {
    return servers.filter((s) => (s.networks?.v4 ?? []).some((v) => v.ip_address?.startsWith(p)))
  }

  if (/[*?]/.test(p)) {
    const re = globToRegExp(p)
    return servers.filter((s) => re.test(s.name.toLowerCase()))
  }

  const exact = servers.filter((s) => s.name.toLowerCase() === p)
  if (exact.length > 0) return exact
  return servers.filter((s) => s.name.toLowerCase().startsWith(p))
}

export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * Named server groups — "web", "db", "prod" — kept locally per account
 * because the BinaryLane API has no server tags.
 *
 * A group is a saved target expression in the palette's grammar (`wp-*`,
 * `db-*,cache-1`, `#101,#102`) plus optional pinned ids, so it stays true as
 * servers come and go: a glob group picks up a new `wp-web-5-syd` the moment
 * it exists. Anywhere that takes a target accepts `@name` for a group.
 */
export interface ServerGroup {
  id: string
  name: string
  /** Palette target expression; empty means "only the pinned ids". */
  pattern: string
  /** Explicit members, in addition to whatever `pattern` matches. */
  serverIds: number[]
  createdAt: string
}

/** Group name as typed in a target: `@web`. */
export function isGroupRef(token: string): boolean {
  return token.trim().startsWith('@') && token.trim().length > 1
}

/**
 * Groups plus one synthesised group per tag that has no explicit group of the
 * same name, so `@db` works the moment something is tagged `db`.
 */
export function effectiveGroups(groups: ServerGroup[], tags: TagMap): ServerGroup[] {
  const have = new Set(groups.map((g) => g.name.toLowerCase()))
  const synthesised = allTags(tags)
    .filter(({ tag }) => !have.has(tag))
    .map(({ tag }) => ({ id: `tag_${tag}`, name: tag, pattern: '', serverIds: [], createdAt: '' }))
  return [...groups, ...synthesised]
}

export function findGroup(groups: ServerGroup[], ref: string): ServerGroup | undefined {
  const name = ref.trim().replace(/^@/, '').toLowerCase()
  return groups.find((g) => g.name.toLowerCase() === name)
}

/** Every server in a group — pinned ids, pattern matches, and servers tagged with the group's name. */
export function resolveGroup<S extends TargetServer>(group: ServerGroup, servers: S[], tags: TagMap = {}): S[] {
  const ids = new Set<number>(group.serverIds)
  if (group.pattern.trim()) {
    for (const m of matchServers(servers, group.pattern).matches) ids.add(m.server.id)
  }
  const name = group.name.toLowerCase()
  for (const [id, list] of Object.entries(tags)) if (list.includes(name)) ids.add(Number(id))
  return servers.filter((s) => ids.has(s.id))
}

/**
 * Expand `@group` references inside a target expression into the concrete
 * server ids they currently match, leaving other patterns untouched. Unknown
 * groups are returned so the caller can say so.
 */
export function expandGroupRefs<S extends TargetServer>(
  expression: string,
  groups: ServerGroup[],
  servers: S[],
  tags: TagMap = {}
): { expression: string; unknownGroups: string[] } {
  const unknownGroups: string[] = []
  const all = effectiveGroups(groups, tags)
  const parts = expression
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => {
      if (!isGroupRef(p)) return [p]
      const g = findGroup(all, p)
      if (!g) {
        unknownGroups.push(p)
        return []
      }
      const members = resolveGroup(g, servers, tags)
      // An empty group must not silently become "no targets" — surface it.
      return members.length ? members.map((s) => `#${s.id}`) : []
    })
  return { expression: parts.join(','), unknownGroups }
}
