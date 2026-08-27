import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BinaryLaneClient } from './client'

// --- SERVERS & COMPUTE ---

export function useServers(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/servers')
      if (error) throw new Error(JSON.stringify(error))
      return data?.servers || []
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

// --- LOAD BALANCERS ---

export function useLoadBalancers(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['loadBalancers'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/load_balancers')
      if (error) throw new Error(JSON.stringify(error))
      return data?.load_balancers || []
    },
    enabled: !!client
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
