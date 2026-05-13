import { useQuery } from '@tanstack/vue-query'
import { listAgents } from '../api/v1/agentsApi'
import type { AgentsListPayload } from '../types/agentTypes'

export function useAgentsQuery() {
  return useQuery<AgentsListPayload>({
    queryKey: ['agents', { limit: 250 }],
    queryFn: listAgents,
  })
}

