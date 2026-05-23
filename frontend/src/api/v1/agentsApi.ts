import { axiosApi } from '../axios'
import { isValidId } from '../../utils/validation'
import type {
  Agent,
  AgentListResponse,
  AgentDelegation,
  AgentPermissionLevel,
  AgentsListPayload,
  DelegationMode,
  ColumnAllowance,
} from '../../types/agentTypes'

function normalizePermissionLevel(raw: unknown): AgentPermissionLevel {
  const s = String(raw ?? 'VIEWER').toUpperCase()
  return s === 'USER' ? 'USER' : 'VIEWER'
}

function normalizeDelegationMode(raw: unknown): DelegationMode {
  const s = String(raw ?? 'FULL').toUpperCase()
  return s === 'COLUMN_BOUND' ? 'COLUMN_BOUND' : 'FULL'
}

function normalizeColumnAllowance(raw: unknown): ColumnAllowance | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  return {
    mode: normalizeDelegationMode(obj.mode),
    restrictedColumnId: typeof obj.restrictedColumnId === 'number' ? obj.restrictedColumnId : undefined,
    allowedMoveRange: typeof obj.allowedMoveRange === 'number' ? obj.allowedMoveRange : 1,
    canViewAllColumns: typeof obj.canViewAllColumns === 'boolean' ? obj.canViewAllColumns : true,
    canMoveAnywhere: typeof obj.canMoveAnywhere === 'boolean' ? obj.canMoveAnywhere : true,
    canHandoffToReview: typeof obj.canHandoffToReview === 'boolean' ? obj.canHandoffToReview : true,
  }
}

function normalizeDelegation(raw: Record<string, unknown>): AgentDelegation {
  const apiKeyId = String(raw.apiKeyId ?? raw.agentId ?? '')
  return {
    id: String(raw.id),
    agentId: apiKeyId,
    projectId: Number(raw.projectId),
    permissionLevel: normalizePermissionLevel(raw.permissionLevel),
    projectName: typeof raw.projectName === 'string' ? raw.projectName : undefined,
    projectPrefix: typeof raw.projectPrefix === 'string' ? raw.projectPrefix : undefined,
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
    revokedAt: raw.revokedAt == null ? null : String(raw.revokedAt),
    delegatedById: typeof raw.delegatedById === 'number' ? raw.delegatedById : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    delegationMode: normalizeDelegationMode(raw.delegationMode),
    restrictedColumnId: typeof raw.restrictedColumnId === 'number' ? raw.restrictedColumnId : null,
    restrictedColumnName:
      typeof raw.restrictedColumnName === 'string' ? raw.restrictedColumnName : undefined,
    allowedMoveRange: typeof raw.allowedMoveRange === 'number' ? raw.allowedMoveRange : 1,
    columnAllowance: normalizeColumnAllowance(raw.columnAllowance),
  }
}

export async function listAgents(): Promise<AgentsListPayload> {
  try {
    const response = await axiosApi.get<AgentListResponse>('/agents', {
      params: { limit: 250 },
      timeout: 60_000,
    })
    const data = response.data
    const agents = Array.isArray(data?.agents) ? data.agents : []
    const total = typeof data?.total === 'number' ? data.total : agents.length
    const activeTotal =
      typeof data?.activeTotal === 'number'
        ? data.activeTotal
        : agents.filter((a) => a.isActive).length
    const limit = typeof data?.limit === 'number' ? data.limit : 250
    return { agents, total, activeTotal, limit }
  } catch (error: any) {
    // When the feature is not yet configured or user has no agents,
    // the backend may currently respond with 500. Treat this as "no agents"
    // instead of surfacing a hard error in the UI.
    if (error?.response?.status === 500) {
      return { agents: [], total: 0, activeTotal: 0, limit: 250 }
    }
    throw error
  }
}

export async function createAgent(payload: {
  name: string
  description?: string
  expiresIn?: number
  avatarSlug?: string
}): Promise<{ agent: Agent; apiKey: string }> {
  const response = await axiosApi.post('/agents', payload)
  return response.data as { agent: Agent; apiKey: string }
}

export async function updateAgent(
  id: string,
  payload: Partial<{
    name: string
    description: string
    isActive: boolean
    expiresIn: number
    avatarSlug: string | ''
  }>,
): Promise<Agent> {
  if (!id) return Promise.reject(new Error('Invalid agent ID'))
  const response = await axiosApi.patch(`/agents/${id}`, payload)
  return (response.data as { agent: Agent }).agent
}

export async function deleteAgent(id: string): Promise<void> {
  if (!id) return Promise.reject(new Error('Invalid agent ID'))
  await axiosApi.delete(`/agents/${id}`)
}

export async function regenerateAgentKey(id: string): Promise<{ agent: Agent; apiKey: string }> {
  if (!id) return Promise.reject(new Error('Invalid agent ID'))
  const response = await axiosApi.post(`/agents/${id}/regenerate-key`)
  return response.data as { agent: Agent; apiKey: string }
}

export async function listDelegations(agentId: string): Promise<AgentDelegation[]> {
  if (!agentId) return Promise.reject(new Error('Invalid agent ID'))
  try {
    const response = await axiosApi.get(`/agents/${agentId}/delegations`)
    const data = response.data as { delegations?: Record<string, unknown>[] }
    if (!Array.isArray(data.delegations)) return []
    return data.delegations.map((row) => normalizeDelegation(row))
  } catch (error: any) {
    if (error?.response?.status === 500) {
      return []
    }
    throw error
  }
}

export async function createDelegation(
  agentId: string,
  payload: {
    projectId: number
    permissionLevel: AgentPermissionLevel
    delegationMode?: DelegationMode
    restrictedColumnId?: number
    allowedMoveRange?: number
  },
): Promise<AgentDelegation> {
  if (!agentId) return Promise.reject(new Error('Invalid agent ID'))
  if (!isValidId(payload.projectId)) return Promise.reject(new Error('Invalid project ID'))
  const body: Record<string, unknown> = {
    projectId: Number(payload.projectId),
    permissionLevel: payload.permissionLevel,
  }
  if (payload.delegationMode) {
    body.delegationMode = payload.delegationMode
  }
  if (payload.restrictedColumnId != null) {
    body.restrictedColumnId = payload.restrictedColumnId
  }
  if (payload.allowedMoveRange != null) {
    body.allowedMoveRange = payload.allowedMoveRange
  }
  const response = await axiosApi.post(`/agents/${agentId}/delegations`, body)
  const raw = (response.data as { delegation: Record<string, unknown> }).delegation
  return normalizeDelegation(raw)
}

export async function updateDelegation(
  agentId: string,
  delegationId: string,
  payload: {
    permissionLevel?: AgentPermissionLevel
    delegationMode?: DelegationMode
    restrictedColumnId?: number | null
    allowedMoveRange?: number
  },
): Promise<AgentDelegation> {
  if (!agentId || !delegationId) return Promise.reject(new Error('Invalid delegation identifiers'))
  const body: Record<string, unknown> = {}
  if (payload.permissionLevel != null) {
    body.permissionLevel = payload.permissionLevel
  }
  if (payload.delegationMode) {
    body.delegationMode = payload.delegationMode
  }
  if (payload.restrictedColumnId !== undefined) {
    body.restrictedColumnId = payload.restrictedColumnId
  }
  if (payload.allowedMoveRange != null) {
    body.allowedMoveRange = payload.allowedMoveRange
  }
  const response = await axiosApi.patch(`/agents/${agentId}/delegations/${delegationId}`, body)
  const raw = (response.data as { delegation: Record<string, unknown> }).delegation
  return normalizeDelegation(raw)
}

export async function deleteDelegation(agentId: string, delegationId: string): Promise<void> {
  if (!agentId || !delegationId) return Promise.reject(new Error('Invalid delegation identifiers'))
  await axiosApi.delete(`/agents/${agentId}/delegations/${delegationId}`)
}

