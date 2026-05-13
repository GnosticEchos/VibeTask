import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { listDelegations } from '@/api/v1/agentsApi'
import type { AgentDelegation } from '@/types/agentTypes'

export function useAgentDelegationsQuery(agentId: Ref<string | undefined>) {
  return useQuery<AgentDelegation[]>({
    queryKey: computed(() => ['agents', agentId.value, 'delegations'] as const),
    queryFn: () => listDelegations(agentId.value!),
    enabled: computed(() => Boolean(agentId.value)),
  })
}
