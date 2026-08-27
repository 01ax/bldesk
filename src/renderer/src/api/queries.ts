import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BinaryLaneClient } from './client'

// --- SERVERS & COMPUTE ---

export function useServers(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      if (!client) return []
      let allServers: any[] = []
      let page = 1
      let hasMore = true

      while (hasMore && page <= 10) {
        const { data, error } = await client.GET('/v2/servers', {
          params: { query: { per_page: 200, page } }
        })
        if (error) break
        const pageServers = data?.servers || []
        allServers = [...allServers, ...pageServers]
        if (!data?.links?.pages?.next || pageServers.length === 0) {
          hasMore = false
        } else {
          page++
        }
      }
      return allServers
    },
    enabled: !!client,
    refetchInterval: 15000 // auto poll fleet every 15s
  })
}

export function useServer(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/servers/{server_id}', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.server || null
    },
    enabled: !!client && !!serverId,
    refetchInterval: 10000
  })
}

export function useServerMetrics(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverMetrics', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/samplesets/{server_id}/latest', {
        params: { path: { server_id: serverId } }
      })
      if (error) return null
      return data?.sample_set || null
    },
    enabled: !!client && !!serverId,
    refetchInterval: 5000 // live gauges poll every 5s
  })
}

export function useServerConsole(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverConsole', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/servers/{server_id}/console', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.console || null
    },
    enabled: !!client && !!serverId,
    staleTime: 60000 // console URLs expire after temporary token
  })
}

// --- SERVER ACTIONS MUTATION ---

export function useServerActionMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serverId, actionPayload }: { serverId: number; actionPayload: any }) => {
      if (!client) throw new Error('No client available')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: actionPayload
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', variables.serverId] })
    }
  })
}

// --- ACCOUNT & BILLING ---

export function useAccount(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['account'],
    queryFn: async () => {
      if (!client) return null
      const { data, error } = await client.GET('/v2/account')
      if (error) throw new Error(JSON.stringify(error))
      return data?.account || null
    },
    enabled: !!client
  })
}

export function useBalance(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      if (!client) return null
      const { data, error } = await client.GET('/v2/customers/my/balance')
      if (error) throw new Error(JSON.stringify(error))
      return data?.balance || null
    },
    enabled: !!client,
    refetchInterval: 60000
  })
}

export function useInvoices(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/customers/my/invoices')
      if (error) throw new Error(JSON.stringify(error))
      return data?.invoices || []
    },
    enabled: !!client
  })
}

export function useDataUsage(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['dataUsageCurrent'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/data_usages/current')
      if (error) return []
      return data?.data_usages || []
    },
    enabled: !!client
  })
}

// --- VPCS ---

export function useVpcs(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['vpcs'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/vpcs')
      if (error) throw new Error(JSON.stringify(error))
      return data?.vpcs || []
    },
    enabled: !!client
  })
}

// --- FIREWALL RULES ---

export function useFirewallRules(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['firewallRules', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/advanced_firewall_rules', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.firewall_rules || []
    },
    enabled: !!client && !!serverId
  })
}

export function useUpdateFirewallRulesMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rules: any[]) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'change_advanced_firewall_rules',
          firewall_rules: rules
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewallRules', serverId] })
    }
  })
}

// --- LOAD BALANCERS ---

export function useLoadBalancers(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['loadBalancers'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/load_balancers')
      if (error) throw new Error(JSON.stringify(error))
      const lbs = data?.load_balancers || []

      // Concurrently fetch full details for each load balancer to ensure server_ids and live status are fully loaded
      const detailedLbs = await Promise.all(
        lbs.map(async (lb) => {
          try {
            const { data: detailData } = await client.GET('/v2/load_balancers/{load_balancer_id}', {
              params: { path: { load_balancer_id: lb.id } }
            })
            return detailData?.load_balancer || lb
          } catch {
            return lb
          }
        })
      )
      return detailedLbs
    },
    enabled: !!client
  })
}

export function useAddServerToLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadBalancerId, serverId }: { loadBalancerId: number; serverId: number }) => {
      if (!client) throw new Error('No client')
      const { error } = await client.POST('/v2/load_balancers/{load_balancer_id}/servers', {
        params: { path: { load_balancer_id: loadBalancerId } },
        body: { server_ids: [serverId] }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useRemoveServerFromLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadBalancerId, serverId }: { loadBalancerId: number; serverId: number }) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/load_balancers/{load_balancer_id}/servers', {
        params: { path: { load_balancer_id: loadBalancerId } },
        body: { server_ids: [serverId] }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useCreateLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/load_balancers', { body })
      if (error) throw new Error(JSON.stringify(error))
      return data?.load_balancer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
    }
  })
}

export function useDeleteLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loadBalancerId: number) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/load_balancers/{load_balancer_id}', {
        params: { path: { load_balancer_id: loadBalancerId } }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
    }
  })
}

// --- DNS DOMAINS & RECORDS ---

export function useDomains(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/domains')
      if (error) throw new Error(JSON.stringify(error))
      return data?.domains || []
    },
    enabled: !!client
  })
}

export function useDomainRecords(client: BinaryLaneClient | null, domainName: string | null) {
  return useQuery({
    queryKey: ['domainRecords', domainName],
    queryFn: async () => {
      if (!client || !domainName) return []
      const { data, error } = await client.GET('/v2/domains/{domain_name}/records', {
        params: { path: { domain_name: domainName } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.domain_records || []
    },
    enabled: !!client && !!domainName
  })
}

// --- SIZES, REGIONS & IMAGES ---

export function useSizes(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['sizes'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/sizes')
      if (error) return []
      return data?.sizes || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useRegions(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/regions')
      if (error) return []
      return data?.regions || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useImages(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['images'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/images')
      if (error) return []
      return data?.images || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useHistoricalMetrics(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['historicalMetrics', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/samplesets/{server_id}', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return (data as any)?.sample_sets || []
    },
    enabled: !!client && !!serverId,
    refetchInterval: 30000
  })
}

export function useCreateServerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/servers', {
        body
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.server
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

// --- SSH KEYS ---

export function useSshKeys(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['sshKeys'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/account/keys')
      if (error) throw new Error(JSON.stringify(error))
      return data?.ssh_keys || []
    },
    enabled: !!client
  })
}

export function useAddSshKeyMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, publicKey }: { name: string; publicKey: string }) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/account/keys', {
        body: { name, public_key: publicKey }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.ssh_key
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] })
    }
  })
}

export function useDeleteSshKeyMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: number) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/account/keys/{key_id}', {
        params: { path: { key_id: keyId } }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] })
    }
  })
}

// --- BACKUPS & SNAPSHOTS ---

export function useServerBackups(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverBackups', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/backups', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.backups || []
    },
    enabled: !!client && !!serverId
  })
}

export function useServerSnapshots(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverSnapshots', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/snapshots', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.snapshots || []
    },
    enabled: !!client && !!serverId
  })
}

export function useTakeBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (label?: string) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'take_backup',
          replacement_strategy: 'none',
          label: label || undefined
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverBackups', serverId] })
      queryClient.invalidateQueries({ queryKey: ['serverSnapshots', serverId] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useRestoreBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: number) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'restore',
          image: imageId
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useToggleAutomatedBackupsMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enable: boolean) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: enable ? 'enable_backups' : 'disable_backups'
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}

export function useAttachBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: number) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'attach_backup',
          image: imageId
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}

export function useDetachBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'detach_backup'
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}
