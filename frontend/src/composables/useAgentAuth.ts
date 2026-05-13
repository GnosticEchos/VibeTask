import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { axiosApi } from '../api/axios'
import type { ColumnAllowance } from '../types/agentTypes'

export interface AgentAuthContext {
  type: 'user' | 'agent'
  user?: {
    id: number
    email: string
    role: string
    name?: string
  }
  agent?: {
    apiKeyId: string
    name: string
  }
  columnAllowance?: ColumnAllowance
  delegations?: Array<{
    projectId: number
    permissionLevel: string
    columnAllowance?: ColumnAllowance
  }>
}

const agentContextCache = ref<AgentAuthContext | null>(null)

async function fetchAgentMe(): Promise<AgentAuthContext | null> {
  try {
    const response = await axiosApi.get('/agent/me')
    const data = response.data as { context?: AgentAuthContext }
    if (data.context) {
      agentContextCache.value = data.context
      return data.context
    }
    return null
  } catch (error: any) {
    // Primary user sessions can receive 401/403/404 on this agent-only route.
    if (
      error?.response?.status === 401 ||
      error?.response?.status === 403 ||
      error?.response?.status === 404
    ) {
      return null
    }
    throw error
  }
}

export function useAgentAuth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agent', 'me'],
    queryFn: fetchAgentMe,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  const context = computed(() => data.value)
  const isAgent = computed(() => context.value?.type === 'agent')
  const isColumnBound = computed(() => 
    context.value?.columnAllowance?.mode === 'COLUMN_BOUND'
  )
  const columnAllowance = computed(() => context.value?.columnAllowance)
  
  // Get column allowance for a specific project (for agents with delegations)
  function getProjectColumnAllowance(projectId: number): ColumnAllowance | undefined {
    if (!context.value?.delegations) return undefined
    const delegation = context.value.delegations.find(d => d.projectId === projectId)
    return delegation?.columnAllowance || context.value?.columnAllowance
  }

  // Check if agent can view a specific column
  function canViewColumn(columnId: number, projectId?: number): boolean {
    // Non-agents (regular users) can view all columns
    if (!isAgent.value) return true
    
    const allowance = projectId 
      ? getProjectColumnAllowance(projectId) 
      : columnAllowance.value
    
    if (!allowance || allowance.mode === 'FULL') return true
    return allowance.restrictedColumnId === columnId
  }

  // Check if agent can move a task between columns
  function canMoveTask(fromColumnId: number, toColumnId: number, projectId?: number): boolean {
    // Non-agents can move tasks freely
    if (!isAgent.value) return true
    
    const allowance = projectId 
      ? getProjectColumnAllowance(projectId) 
      : columnAllowance.value
    
    if (!allowance || allowance.mode === 'FULL') return true
    
    // Agent can always move within their restricted column
    if (fromColumnId === toColumnId) return true
    
    // Check if this is a handoff to Agent Review column
    // (handled separately by the task handoff logic)
    
    // Check move range restriction
    const restrictedId = allowance.restrictedColumnId
    if (restrictedId == null) return true
    
    // Agent can only move from their restricted column
    if (fromColumnId !== restrictedId) return false
    
    // Check if destination is within allowed range
    // Note: This is a simplified check - the actual column positions
    // would need to be known to calculate true distance
    // For now, we rely on the backend to enforce the range
    return true
  }

  return {
    context,
    isAgent,
    isColumnBound,
    columnAllowance,
    isLoading,
    error,
    refetch,
    canViewColumn,
    canMoveTask,
    getProjectColumnAllowance,
  }
}