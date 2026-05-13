/** Global system role from Better Auth / session (not project Owner/Maintainer). */
export type GlobalUserRole = 'USER' | 'SUPPORT' | 'ADMIN'

export interface UserPermissions {
  isAdmin: boolean
  canManageRateLimits: boolean
  canManageUsers: boolean
  canManageSystem: boolean
}

/** User object returned by login, register, and GET /session. */
export interface AuthSessionUser {
  id: number
  name: string
  fullName: string
  email: string
  /** Empty string when the backend sends null or no avatar. */
  avatarUrl: string
  role: GlobalUserRole
  permissions: UserPermissions
}

export interface SessionResponse {
  user: AuthSessionUser
}

export interface iLoginResponse {
  token: string
  user: AuthSessionUser
}
