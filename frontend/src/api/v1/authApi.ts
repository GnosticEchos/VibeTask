import { iLoginResponse, SessionResponse } from '../../types/authTypes'
import type { PersistedSettingsLayoutsV1 } from '../../types/settingsLayoutTypes'

import { axiosApi } from '../axios'

const login = async (
  email: string,
  password: string,
): Promise<iLoginResponse> => {
  const response = await axiosApi.post('/login', { email, password })
  return response.data
}

const register = async (
  name: string,
  email: string,
  password: string,
): Promise<iLoginResponse> => {
  const response = await axiosApi.post('/register', { name, email, password })
  return response.data
}

const getSession = async (): Promise<SessionResponse> => {
  const response = await axiosApi.get<SessionResponse>('/session')
  return response.data
}

const getCurrentUser = async (): Promise<SessionResponse> => {
  const response = await axiosApi.get<SessionResponse>('/users/me')
  return response.data
}

const updateCurrentUser = async (payload: {
  name: string
  avatarUrl?: string | null
}): Promise<SessionResponse> => {
  const response = await axiosApi.patch<SessionResponse>('/users/me', payload)
  return response.data
}

const changeCurrentUserPassword = async (payload: {
  currentPassword: string
  newPassword: string
}): Promise<void> => {
  await axiosApi.post('/users/me/password', payload)
}

export interface AccountSessionInfo {
  id: string
  createdAt: string
  lastSeenAt: string
  ip: string | null
  userAgent: string | null
  isCurrent: boolean
}

export interface AccountPreferences {
  locale: string
  timezone: string
  emailNotifications: {
    taskAssigned: boolean
    taskCommented: boolean
    dailyDigest: boolean
  }
}

const getCurrentUserSessions = async (): Promise<{ sessions: AccountSessionInfo[] }> => {
  const response = await axiosApi.get<{ sessions: AccountSessionInfo[] }>('/users/me/sessions')
  return response.data
}

const revokeCurrentUserSession = async (sessionId: string): Promise<void> => {
  await axiosApi.delete(`/users/me/sessions/${Number(sessionId)}`)
}

const revokeOtherCurrentUserSessions = async (): Promise<void> => {
  await axiosApi.post('/users/me/sessions/revoke-others')
}

const getCurrentUserPreferences = async (): Promise<{ preferences: AccountPreferences }> => {
  const response = await axiosApi.get<{ preferences: AccountPreferences }>('/users/me/preferences')
  return response.data
}

const updateCurrentUserPreferences = async (
  payload: Partial<AccountPreferences>,
): Promise<{ preferences: AccountPreferences }> => {
  const response = await axiosApi.patch<{ preferences: AccountPreferences }>('/users/me/preferences', payload)
  return response.data
}

const getSettingsLayout = async (): Promise<{ layout: PersistedSettingsLayoutsV1 | null }> => {
  const response = await axiosApi.get<{ layout: PersistedSettingsLayoutsV1 | null }>('/users/me/settings-layout')
  return response.data
}

const putSettingsLayout = async (
  layout: PersistedSettingsLayoutsV1,
): Promise<{ layout: PersistedSettingsLayoutsV1 }> => {
  const response = await axiosApi.put<{ layout: PersistedSettingsLayoutsV1 }>('/users/me/settings-layout', {
    layout,
  })
  return response.data
}

const deleteSettingsLayout = async (): Promise<void> => {
  await axiosApi.delete('/users/me/settings-layout')
}

export default {
  login,
  register,
  getSession,
  getCurrentUser,
  updateCurrentUser,
  changeCurrentUserPassword,
  getCurrentUserSessions,
  revokeCurrentUserSession,
  revokeOtherCurrentUserSessions,
  getCurrentUserPreferences,
  updateCurrentUserPreferences,
  getSettingsLayout,
  putSettingsLayout,
  deleteSettingsLayout,
}
