export interface HelpLocation { slug?: string; heading?: string; query?: string; ask?: boolean }
export const HELP_OPEN_EVENT = 'bldesk:open-help'
export const LOCAL_DEEP_LINK_EVENT = 'bldesk:local-deep-link'
export function openHelp(location: HelpLocation = {}): void {
  window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT, { detail: location }))
}
