/**
 * What the Android back button closes first. A popover, an editor or a picker that is open registers a handler here
 * while it is open; back runs the most recently registered one (the topmost thing on screen) and stops there. With none
 * registered it returns false and the app goes back the way it always has (androidBack.ts, App.tsx). Pure, so it has
 * a test (scripts/test-server-tags.mjs); the React hook that registers is in useBackHandler.ts.
 */
type Handler = () => void

const stack: Handler[] = []

/** Registers `handler` as the topmost; the function it returns removes it. */
export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Runs the topmost handler. True if there was one, so the back press is used up. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/** How many handlers are registered (for tests). */
export function backHandlerCount(): number {
  return stack.length
}
