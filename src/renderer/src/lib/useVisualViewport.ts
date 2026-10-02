import { useEffect, useState } from 'react'

/**
 * The part of the screen that can be seen: the window minus the soft keyboard where the platform shrinks the visual
 * viewport for it (and the page when it is zoomed). Position and size follow window.visualViewport, falling back to
 * the window. Used to keep an editor, and its Save button, inside what is visible.
 */
export function useVisualViewport(): { top: number; height: number } {
  const read = () => {
    const vv = window.visualViewport
    return { top: vv ? vv.offsetTop : 0, height: Math.round(vv ? vv.height : window.innerHeight) }
  }
  const [box, setBox] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setBox(read())
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return box
}
