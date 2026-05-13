import { axiosApi } from '../axios'

/** When backend sets RATE_LIMIT_ADMIN_BYPASS=true and a key, match it here so admin calls can bypass 429 while tuning limits. */
function rateLimitAdminBypassHeaders(): Record<string, string> {
  const key = import.meta.env.VITE_RATE_LIMIT_ADMIN_BYPASS_KEY as string | undefined
  if (key && String(key).trim()) {
    return { 'X-Admin-Bypass-Key': String(key).trim() }
  }
  return {}
}

export interface RateLimitConfig {
  id: number
  name: string
  endpointPattern: string
  windowMs: number
  maxRequests: number
  enabled: boolean
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface RateLimitConfigsResponse {
  configs: RateLimitConfig[]
}

export interface UpdateRateLimitPayload {
  name?: string
  endpointPattern?: string
  windowMs?: number
  maxRequests?: number
  enabled?: boolean
  description?: string | null
}

export async function getRateLimitConfigs(): Promise<RateLimitConfig[]> {
  const response = await axiosApi.get<RateLimitConfigsResponse>('admin/rate-limits', {
    headers: rateLimitAdminBypassHeaders(),
  })
  const configs = response.data?.configs
  return Array.isArray(configs) ? configs : []
}

export async function updateRateLimitConfig(
  id: number,
  payload: UpdateRateLimitPayload,
): Promise<RateLimitConfig> {
  const response = await axiosApi.put<{ config: RateLimitConfig }>(
    `admin/rate-limits/${Number(id)}`,
    payload,
    { headers: rateLimitAdminBypassHeaders() },
  )
  const cfg = response.data?.config
  if (!cfg) throw new Error('Invalid rate limit update response')
  return cfg
}

export async function toggleRateLimitConfig(id: number): Promise<RateLimitConfig> {
  const response = await axiosApi.post<{ config: RateLimitConfig }>(
    `admin/rate-limits/${Number(id)}/toggle`,
    undefined,
    { headers: rateLimitAdminBypassHeaders() },
  )
  const cfg = response.data?.config
  if (!cfg) throw new Error('Invalid rate limit toggle response')
  return cfg
}

/** Global roles returned by `GET /api/admin/users` (matches Prisma `UserRole`). */
export type GlobalUserRole = 'USER' | 'SUPPORT' | 'ADMIN'

export interface AdminUserRow {
  id: number
  email: string
  name: string | null
  surname: string | null
  role: GlobalUserRole
  createdAt: string
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const response = await axiosApi.get<{ users: AdminUserRow[] }>('admin/users', {
    headers: rateLimitAdminBypassHeaders(),
  })
  const users = response.data?.users
  return Array.isArray(users) ? users : []
}

export async function patchAdminUserRole(
  userId: number,
  role: GlobalUserRole,
): Promise<AdminUserRow> {
  const response = await axiosApi.patch<{ user: AdminUserRow }>(
    `admin/users/${Number(userId)}/role`,
    { role },
    { headers: rateLimitAdminBypassHeaders() },
  )
  const user = response.data?.user
  if (!user) throw new Error('Invalid admin user role update response')
  return user
}

export interface IssueTemporaryPasswordResponse {
  temporaryPassword: string
  user: { id: number; email: string }
  message: string
}

/** Admin issues a one-time password; relay manually (not emailed). */
export async function postAdminTemporaryPassword(
  userId: number,
): Promise<IssueTemporaryPasswordResponse> {
  const response = await axiosApi.post<IssueTemporaryPasswordResponse>(
    `admin/users/${Number(userId)}/temporary-password`,
    {},
    { headers: rateLimitAdminBypassHeaders() },
  )
  const data = response.data
  if (!data?.temporaryPassword || !data.user) {
    throw new Error('Invalid temporary password response')
  }
  return data
}

/** Same shape as public `GET /health`; requires ADMIN (`/api/admin/health`). */
export interface SystemHealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  services: {
    database: { status: string; message?: string }
    websocket: {
      status: string
      message?: string
      connectedClients?: number
      port?: number
    }
  }
}

export async function getAdminSystemHealth(): Promise<SystemHealthResponse> {
  const response = await axiosApi.get<SystemHealthResponse>('admin/health', {
    timeout: 8000,
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data
}

export interface PlatformAgentEndpointOption {
  path: string
  label: string
}

export interface PlatformAgent {
  id: string
  name: string
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  targetUser: { id: number; name: string | null; email: string } | null
  sessionExpirySeconds: number
  metadata?: {
    isPlatformAgent?: boolean
    description?: string | null
    allowedReadEndpoints?: string[]
    sessionExpirySeconds?: number
    [key: string]: unknown
  }
}

export interface PlatformAgentsResponse {
  agents: PlatformAgent[]
  total: number
  activeTotal: number
}

export async function getPlatformAgents(): Promise<PlatformAgentsResponse> {
  const response = await axiosApi.get<PlatformAgentsResponse>('admin/platform-agents', {
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data
}

export async function getPlatformAgentEndpointCatalog(): Promise<PlatformAgentEndpointOption[]> {
  const response = await axiosApi.get<{ endpoints: PlatformAgentEndpointOption[] }>('admin/platform-agents/endpoint-catalog', {
    headers: rateLimitAdminBypassHeaders(),
  })
  return Array.isArray(response.data?.endpoints) ? response.data.endpoints : []
}

export interface PlatformAgentUpsertPayload {
  name?: string
  description?: string
  isActive?: boolean
  expiresIn?: number
  allowedReadEndpoints?: string[]
  targetUserId?: number
  sessionExpirySeconds?: number
}

export async function createPlatformAgent(payload: { name: string; targetUserId: number } & PlatformAgentUpsertPayload): Promise<{ agent: PlatformAgent; apiKey: string }> {
  const response = await axiosApi.post<{ agent: PlatformAgent; apiKey: string }>('admin/platform-agents', payload, {
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data
}

export async function updatePlatformAgent(id: string, payload: PlatformAgentUpsertPayload): Promise<{ agent: PlatformAgent }> {
  const response = await axiosApi.patch<{ agent: PlatformAgent }>(`admin/platform-agents/${id}`, payload, {
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data
}

export async function regeneratePlatformAgentKey(id: string): Promise<{ agent: PlatformAgent; apiKey: string }> {
  const response = await axiosApi.post<{ agent: PlatformAgent; apiKey: string }>(`admin/platform-agents/${id}/regenerate-key`, {}, {
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data
}

export async function deletePlatformAgent(id: string): Promise<void> {
  await axiosApi.delete(`admin/platform-agents/${id}`, {
    headers: rateLimitAdminBypassHeaders(),
  })
}
