import { useEffect, useRef, useState } from 'react'
import { components } from '@shared/api/schema'
import { AccountProfile } from '@shared/ipc-types'
import { DeepLink, formatDeepLink, parseDeepLink } from '@shared/deeplink'
import { BinaryLaneClient } from '../api/client'
import { ActiveTab, ServerSubTab } from '../components/layout/Sidebar'
import { openServerSsh } from './openServerSsh'
import { openHelp, LOCAL_DEEP_LINK_EVENT } from './helpNavigation'

type ServerResponse = components['schemas']['Server']

export { formatDeepLink, parseDeepLink }
export type { DeepLink }

/** Copy a bldesk:// link to the clipboard. Returns the link text. */
export async function copyDeepLink(link: DeepLink): Promise<string> {
  const url = formatDeepLink(link)
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // clipboard unavailable — caller can still show the URL
  }
  return url
}

export function primaryIpv4(server: ServerResponse): string | undefined {
  return server.networks?.v4?.find((v) => v.type === 'public')?.ip_address || server.networks?.v4?.[0]?.ip_address
}

interface RouterDeps {
  profiles: Omit<AccountProfile, 'token'>[]
  activeProfile: AccountProfile | null
  client: BinaryLaneClient | null
  servers: ServerResponse[]
  isLoadingServers: boolean
  onSwitchProfile: (profileId: string) => Promise<void> | void
  onSelectServer: (server: ServerResponse) => void
  onSelectServerSubTab: (tab: ServerSubTab) => void
  onSelectTab: (tab: ActiveTab) => void
  /** The saved profiles have been read. Before that a link naming an account cannot be matched, and must wait. */
  ready: boolean
}

/**
 * Subscribes to bldesk:// links (cold-start and while running) and routes them
 * once the app has enough state to act — the right profile, a client, and the
 * server list. Links that arrive early simply wait in `pending` until they can
 * be resolved, so a link that launched the app works the same as one clicked
 * while it's open.
 */
export function useDeepLinkRouter(deps: RouterDeps): void {
  const [pending, setPending] = useState<DeepLink | null>(null)
  // Bumped when a link finishes, so one that arrived meanwhile is looked at again (the effect skips links while one is open).
  const [settled, setSettled] = useState(0)
  const depsRef = useRef(deps)
  depsRef.current = deps
  const busyRef = useRef(false)
  /**
   * The profile a link asked to switch to, until it is the active one. The link is kept while the switch lands: acting
   * on it sooner would look the server up in the profile still in use (and say it was not found there), or open it
   * there. It ends when the link is acted on or a newer link replaces it, so its timeout cannot fire for a link that
   * has already been dealt with.
   */
  const awaiting = useRef<{ profileId: string; timer?: ReturnType<typeof setTimeout> } | null>(null)
  const stopAwaiting = () => {
    if (awaiting.current?.timer) clearTimeout(awaiting.current.timer)
    awaiting.current = null
  }

  // Subscribe once
  useEffect(() => {
    const api = window.bldeskApi

    const accept = (url: string | null) => {
      if (!url) return
      const link = parseDeepLink(url)
      if (!link) {
        console.warn('[DeepLink] Ignoring unrecognised link:', url)
        return
      }
      stopAwaiting() // a newer link replaces one that was waiting for a profile switch
      setPending(link)
    }

    const local = (event: Event) => accept((event as CustomEvent<string>).detail)
    window.addEventListener(LOCAL_DEEP_LINK_EVENT, local)
    const unsub = api?.onDeepLink?.(accept)
    api?.getPendingDeepLink?.().then(accept).catch(() => {})
    api?.deepLinkReady?.().catch(() => {})
    return () => { unsub?.(); window.removeEventListener(LOCAL_DEEP_LINK_EVENT, local) }
  }, [])

  // Resolve whenever the link or the state it depends on changes
  useEffect(() => {
    if (!pending || busyRef.current) return
    const d = depsRef.current
    const link = pending

    if (link.kind === 'help') {
      stopAwaiting()
      openHelp({ slug: link.slug, heading: link.heading })
      setPending(null)
      return
    }

    // 1. Account switch requested?
    if (link.account) {
      // Until the saved profiles have been read nothing can match: stripping the account then would open the link on
      // the default profile.
      if (!d.ready) return
      const wanted = link.account.toLowerCase()
      const matches = (p: { name: string; email?: string }) =>
        p.name.toLowerCase() === wanted || (p.email || '').toLowerCase() === wanted
      const target = d.profiles.find(matches)
      const stripped = { ...link, account: undefined } as DeepLink
      if (target && (!d.activeProfile || d.activeProfile.id !== target.id)) {
        stopAwaiting()
        const entry: { profileId: string; timer?: ReturnType<typeof setTimeout> } = { profileId: target.id }
        const giveUp = () => {
          if (awaiting.current !== entry) return
          awaiting.current = null
          setPending(null)
          alert(`Couldn't switch to the account "${link.account}", so the link was not opened.`)
        }
        awaiting.current = entry
        setPending(stripped) // re-run after the switch lands
        Promise.resolve(d.onSwitchProfile(target.id)).catch(giveUp)
        // A switch that never lands must not hold the link for ever.
        entry.timer = setTimeout(giveUp, 15000)
        return
      }
      if (!target) console.warn(`[DeepLink] No profile matches account "${link.account}"; using the active one`)
      setPending(stripped)
      return
    }

    // 2. Navigation-only links need no data
    if (link.kind === 'home') {
      stopAwaiting()
      setPending(null)
      return
    }
    if (link.kind === 'tab') {
      stopAwaiting()
      d.onSelectTab(link.tab as ActiveTab)
      setPending(null)
      return
    }

    // 3. Server-scoped links need a client and (ideally) the server list
    if (awaiting.current) {
      if (d.activeProfile?.id !== awaiting.current.profileId) return // the switch has not landed yet
      stopAwaiting()
    }
    if (!d.client) return // wait for auth
    const cached = d.servers.find((s) => s.id === link.serverId)
    if (!cached && d.isLoadingServers) return // wait for the first fetch

    busyRef.current = true
    ;(async () => {
      try {
        let server: ServerResponse | null = cached ?? null
        if (!server) {
          const { data } = await d.client!.GET('/v2/servers/{server_id}', { params: { path: { server_id: link.serverId } } })
          server = (data?.server as ServerResponse | undefined) ?? null
        }
        if (!server) {
          alert(`Server #${link.serverId} was not found on ${d.activeProfile?.name ?? 'this account'}.`)
          return
        }

        switch (link.kind) {
          case 'server':
            d.onSelectServer(server)
            if (link.subTab) d.onSelectServerSubTab(link.subTab as ServerSubTab)
            d.onSelectTab('servers')
            break

          case 'ssh': {
            d.onSelectServer(server)
            d.onSelectTab('servers')
            await openServerSsh(server, d.activeProfile?.id)
            break
          }

          case 'console': {
            d.onSelectServer(server)
            d.onSelectServerSubTab('remote-access')
            d.onSelectTab('servers')
            const { data } = await d.client!.GET('/v2/servers/{server_id}/console', {
              params: { path: { server_id: server.id } }
            })
            const url = data?.console?.browser || data?.console?.iframe
            if (!url) {
              alert(`Couldn't get a rescue console URL for ${server.name}.`)
              break
            }
            const opened = await window.bldeskApi?.openRescueConsole?.({
              serverId: server.id,
              serverName: server.name,
              url,
              width: data?.console?.width || 1024,
              height: data?.console?.height || 768
            })
            if (opened && !opened.success) throw new Error(opened.error || 'The console window did not open.')
            break
          }
        }
      } catch (err: any) {
        console.error('[DeepLink] Failed to route link:', err)
        alert(`Couldn't open link: ${err?.message || err}`)
      } finally {
        busyRef.current = false
        // Only this link: one that arrived while it was being opened (a console page can take a while) stays.
        setPending((p) => (p === link ? null : p))
        setSettled((n) => n + 1)
      }
    })()
  }, [pending, deps.activeProfile?.id, deps.client, deps.servers, deps.isLoadingServers, deps.profiles, deps.ready, settled])
}
