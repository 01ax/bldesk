import {
  autoColorNewTags,
  cleanCustomColours,
  cleanTagColors,
  cleanTagMap,
  newColorMap,
  newTagMap,
  pruneTagColors,
  type Rng,
  type ServerGroup,
  type TagColorMap,
  type TagMap
} from './tags'

/**
 * Where tags, tag colours, saved custom colours and server groups are kept: local storage, per account profile (the
 * custom colours are a user palette and are not per profile). The pure parts - matching, naming, colours, renaming -
 * are in tags.ts and re-exported here, because this is where every caller has always found them.
 */
export {
  allTags,
  normaliseTag,
  tagsOf,
  withTag,
  withTagColor,
  renameTag,
  tagNameProblem,
  tagServerCount,
  TAG_COLOR_KEYS,
  isTagColorKey,
  colorOf,
  effectiveGroups,
  findGroup,
  isGroupRef,
  resolveGroup,
  expandGroupRefs
} from './tags'
export type { TagMap, TagColorKey, TagColorMap, ServerGroup } from './tags'

const KEY = (profileId: string) => `bldesk_server_groups_${profileId}`
const TAGS_KEY = (profileId: string) => `bldesk_server_tags_${profileId}`
const COLORS_KEY = (profileId: string) => `bldesk_tag_colors_${profileId}`
/** App-wide, not per profile: the saved custom colours are the user's own palette, not account data. */
export const CUSTOM_COLOURS_KEY = 'bldesk_tag_custom_colours'

export function loadTags(profileId: string | undefined): TagMap {
  if (!profileId) return newTagMap()
  try {
    const raw = localStorage.getItem(TAGS_KEY(profileId))
    // Rows are drawn from this, so it is rebuilt key by key (cleanTagMap): a value of the wrong shape is dropped, not thrown on.
    return cleanTagMap(raw ? JSON.parse(raw) : {})
  } catch {
    return newTagMap()
  }
}

export interface SaveTagsOptions {
  /**
   * Give a tag that is new (no server had the name) and has no colour the first preset no tag in use has, or a random
   * colour once every preset is taken. On by default: this is the one place every way of adding a tag goes through
   * (palette, Fleet matrix, a server's Tags section, a template). Off for a rename, where the new name is the old tag.
   */
  autoColor?: boolean
  /** Source of randomness for the colour of a new tag once the presets are used up; a test can pin it. */
  rng?: Rng
}

export function saveTags(profileId: string, tags: TagMap, options: SaveTagsOptions = {}): void {
  const before = loadTags(profileId)
  try {
    localStorage.setItem(TAGS_KEY(profileId), JSON.stringify(tags))
  } catch {
    // storage unavailable
  }
  // A colour belongs to a tag in use: when the last server loses a tag its colour goes too, and a new tag gets one.
  const colors = loadTagColors(profileId)
  const next = options.autoColor === false ? colors : autoColorNewTags(before, tags, colors, options.rng)
  const kept = options.autoColor === false ? pruneTagColors(colors, tags) : next
  if (JSON.stringify(kept) !== JSON.stringify(colors)) writeTagColors(profileId, kept)
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

/** Tag colours, one per tag NAME, per profile, next to the tags. A value is a preset key or a `#rrggbb` hex; anything else is dropped on read. */
export function loadTagColors(profileId: string | undefined): TagColorMap {
  if (!profileId) return newColorMap()
  try {
    const raw = localStorage.getItem(COLORS_KEY(profileId))
    return cleanTagColors(raw ? JSON.parse(raw) : {})
  } catch {
    return newColorMap()
  }
}

function writeTagColors(profileId: string, colors: TagColorMap): void {
  try {
    if (Object.keys(colors).length) localStorage.setItem(COLORS_KEY(profileId), JSON.stringify(colors))
    else localStorage.removeItem(COLORS_KEY(profileId))
  } catch {
    // storage unavailable
  }
}

export function saveTagColors(profileId: string, colors: TagColorMap): void {
  writeTagColors(profileId, colors)
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

/** The saved custom colours: `#rrggbb`, at most eight. */
export function loadCustomColours(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLOURS_KEY)
    return cleanCustomColours(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

export function saveCustomColours(list: string[]): void {
  try {
    if (list.length) localStorage.setItem(CUSTOM_COLOURS_KEY, JSON.stringify(list))
    else localStorage.removeItem(CUSTOM_COLOURS_KEY)
  } catch {
    // storage unavailable
  }
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

/** Fired on window whenever groups, tags or tag colours change. */
export const GROUPS_EVENT = 'bldesk:server-groups'

export function loadGroups(profileId: string | undefined): ServerGroup[] {
  if (!profileId) return []
  try {
    const raw = localStorage.getItem(KEY(profileId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((g) => g && typeof g.name === 'string') : []
  } catch {
    return []
  }
}

export function saveGroups(profileId: string, groups: ServerGroup[]): void {
  try {
    localStorage.setItem(KEY(profileId), JSON.stringify(groups))
  } catch {
    // storage unavailable
  }
  try {
    window.dispatchEvent(new CustomEvent(GROUPS_EVENT))
  } catch {
    // no window
  }
}

export function newGroup(name: string, pattern: string, serverIds: number[] = []): ServerGroup {
  return {
    id: `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    pattern: pattern.trim(),
    serverIds: [...new Set(serverIds)],
    createdAt: new Date().toISOString()
  }
}
