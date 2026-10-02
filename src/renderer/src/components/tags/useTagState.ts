import { useEffect, useState } from 'react'
import { GROUPS_EVENT, loadTagColors, loadTags } from '../../lib/serverGroups'
import type { TagColorMap, TagMap } from '../../lib/tags'

/**
 * This profile's tags and tag colours, read again whenever either changes anywhere in the app (the palette's `tag`
 * verb, the Fleet matrix, a template's post-create step, an editor on another page).
 */
export function useTagState(profileId: string | undefined): { tags: TagMap; colors: TagColorMap } {
  const [state, setState] = useState(() => ({ tags: loadTags(profileId), colors: loadTagColors(profileId) }))
  useEffect(() => {
    const read = () => setState({ tags: loadTags(profileId), colors: loadTagColors(profileId) })
    read()
    window.addEventListener(GROUPS_EVENT, read)
    return () => window.removeEventListener(GROUPS_EVENT, read)
  }, [profileId])
  return state
}
