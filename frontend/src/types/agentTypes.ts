export interface Agent {
  id: string
  name: string
  prefix: string
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  metadata?: {
    isAgent?: boolean
    description?: string | null
    /** Built-in avatar id (SVG basename without `.svg`) */
    avatarSlug?: string | null
    createdBy?: number
    // Allow backend to add more metadata fields without breaking the UI
    [key: string]: unknown
  }
}

export interface AgentListResponse {
  agents: Agent[]
  /** Total agent keys for the user (not limited by `limit`). */
  total?: number
  /** Count of enabled agent keys for the user. */
  activeTotal?: number
  /** Server-side page size cap for `agents`. */
  limit?: number
}

/** Normalized payload from GET /api/agents (TanStack Query). */
export interface AgentsListPayload {
  agents: Agent[]
  total: number
  activeTotal: number
  limit: number
}

export type AgentPermissionLevel = 'VIEWER' | 'USER'

export type DelegationMode = 'FULL' | 'COLUMN_BOUND'

export interface ColumnAllowance {
  mode: DelegationMode
  restrictedColumnId?: number
  allowedMoveRange: number
  canViewAllColumns: boolean
  canMoveAnywhere: boolean
  canHandoffToReview: boolean
}

export interface AgentDelegation {
  id: string
  /** Same as Better Auth API key id; backend field name is `apiKeyId`. */
  agentId: string
  projectId: number
  permissionLevel: AgentPermissionLevel
  projectName?: string
  projectPrefix?: string
  isActive?: boolean
  revokedAt?: string | null
  delegatedById?: number
  createdAt?: string
  updatedAt?: string
  // Column-bound agent fields
  delegationMode?: DelegationMode
  restrictedColumnId?: number | null
  restrictedColumnName?: string
  allowedMoveRange?: number
  columnAllowance?: ColumnAllowance
}

