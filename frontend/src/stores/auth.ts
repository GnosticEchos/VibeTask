import { authorizeAxios, deauthorizeAxios } from '../api/axios'
import api from '../api/v1/indexApi'
import { useLayoutStore } from './layout'
import { useWebsocketStore } from './websocket'
import {
  type AuthSessionUser,
  type GlobalUserRole,
  type iLoginResponse,
  type UserPermissions,
} from '../types/authTypes'
import { defineStore } from 'pinia'
import { ref, Ref } from 'vue'
import { useRouter } from 'vue-router'
import i18n from '../locale'
import { devWarn } from '@/utils/logger'
import { ApiError, UnauthorizedError, ValidationError } from '@/api/errors'

function normalizeUser(raw: Record<string, unknown> | AuthSessionUser | null | undefined): AuthSessionUser {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 0,
      name: '',
      fullName: '',
      email: '',
      avatarUrl: '',
      role: 'USER',
      permissions: {
        isAdmin: false,
        canManageRateLimits: false,
        canManageUsers: false,
        canManageSystem: false,
      },
    }
  }
  const idRaw = (raw as { id?: unknown }).id
  const id = (() => {
    if (idRaw == null || idRaw === '') return 0
    const n = typeof idRaw === 'number' ? idRaw : Number(idRaw)
    return Number.isFinite(n) && n > 0 ? n : 0
  })()
  const roleStr =
    typeof (raw as AuthSessionUser).role === 'string'
      ? (raw as AuthSessionUser).role.trim().toUpperCase()
      : 'USER'
  if (roleStr && !['USER', 'SUPPORT', 'ADMIN'].includes(roleStr)) {
    devWarn('[Auth] Unknown user role from backend; defaulting to USER', { role: roleStr })
  }
  const role = (['USER', 'SUPPORT', 'ADMIN'].includes(roleStr) ? roleStr : 'USER') as GlobalUserRole
  const isAdmin = role === 'ADMIN'
  const perms = (raw as AuthSessionUser).permissions
  const permissions: UserPermissions =
    perms && typeof perms === 'object'
      ? {
          isAdmin: Boolean(perms.isAdmin),
          canManageRateLimits: Boolean(perms.canManageRateLimits),
          canManageUsers: Boolean(perms.canManageUsers),
          canManageSystem: Boolean(perms.canManageSystem),
        }
      : {
          isAdmin,
          canManageRateLimits: isAdmin,
          canManageUsers: isAdmin,
          canManageSystem: isAdmin,
        }

  const name = typeof (raw as AuthSessionUser).name === 'string' ? (raw as AuthSessionUser).name : ''
  const fullName =
    typeof (raw as AuthSessionUser).fullName === 'string'
      ? (raw as AuthSessionUser).fullName
      : name
  const email = typeof (raw as AuthSessionUser).email === 'string' ? (raw as AuthSessionUser).email : ''
  const av = (raw as AuthSessionUser).avatarUrl
  const avatarUrl =
    av === null || av === undefined ? '' : typeof av === 'string' ? av : ''

  return {
    id,
    name,
    fullName,
    email,
    avatarUrl,
    role,
    permissions,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user: Ref<AuthSessionUser> = ref(normalizeUser(null))
  const loading = ref<boolean>(false)
  const token = ref<string>('')

  const websocketStore = useWebsocketStore()
  const layoutStore = useLayoutStore()
  const router = useRouter()

  const isAuthorized = () => {
    return !!token.value && Number(user.value?.id) > 0
  }

  const setToken = (userToken: string) => {
    localStorage.setItem('KAN-Auth-Token', userToken)
    token.value = userToken
  }

  const setUser = (userData: Record<string, unknown> | AuthSessionUser | null | undefined) => {
    const normalized = normalizeUser(userData)
    localStorage.setItem('KAN-User', JSON.stringify(normalized))
    user.value = normalized
  }

  const clearAuth = () => {
    websocketStore.disconnectWS()
    deauthorizeAxios()
    localStorage.removeItem('KAN-Auth-Token')
    localStorage.removeItem('KAN-User')
    token.value = ''
    user.value = normalizeUser(null)
    layoutStore.setLayoutDefaultState()
  }

  /** Refresh role and permissions from GET /api/session (authoritative). */
  const refreshSession = async () => {
    if (!token.value) return
    try {
      const { user: sessionUser } = await api.getSession()
      setUser(sessionUser)
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        clearAuth()
      }
      throw err
    }
  }

  const setAuth = async (payload: iLoginResponse | null = null) => {
    const nextToken = payload?.token || localStorage.getItem('KAN-Auth-Token')
    if (!nextToken) {
      logout()
      return
    }

    setToken(nextToken)
    authorizeAxios(nextToken)

    if (payload?.user) {
      setUser(payload.user)
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('KAN-User') || 'null')
        setUser(stored)
      } catch {
        setUser(null)
      }
    }

    try {
      await refreshSession()
    } catch {
      /* refreshSession handles 401; allow stale local user on network errors */
    }

    websocketStore.disconnectWS()
    websocketStore.connectWS()
  }

  const logout = () => {
    clearAuth()
    router.push({ name: 'Login' })
  }

  const loginUser = async ({
    email,
    password,
  }: {
    email: string
    password: string
  }) => {
    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    if (!trimmedEmail || !password) {
      layoutStore.openToast({
        message: i18n.global.t('login.validationMessage'),
        type: 'error',
      })
      return
    }
    try {
      loading.value = true
      const response = await api.login(trimmedEmail, password)
      await setAuth(response)
      router.push({ name: 'Dashboard' })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const msg = err instanceof ValidationError
          ? i18n.global.t('login.validationMessage')
          : err.message || i18n.global.t('login.failureMessage')
        layoutStore.openToast({ message: msg, type: 'error' })
      } else {
        layoutStore.openToast({
          message: err instanceof Error ? err.message : i18n.global.t('login.failureMessage'),
          type: 'error',
        })
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  const registerUser = async ({
    name,
    email,
    password,
  }: {
    name: string
    email: string
    password: string
  }) => {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    if (!trimmedName || !trimmedEmail || !password) {
      layoutStore.openToast({
        message: i18n.global.t('signup.validationMessage'),
        type: 'error',
      })
      return
    }
    try {
      loading.value = true
      const response = await api.register(trimmedName, trimmedEmail, password)
      await setAuth(response)
      router.push({ name: 'Dashboard' })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const msg = err instanceof ValidationError
          ? i18n.global.t('signup.validationMessage')
          : err.message || i18n.global.t('signup.failureMessage')
        layoutStore.openToast({ message: msg, type: 'error' })
      } else {
        layoutStore.openToast({
          message: err instanceof Error ? err.message : i18n.global.t('signup.failureMessage'),
          type: 'error',
        })
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    loading,
    loginUser,
    registerUser,
    token,
    setUser,
    setAuth,
    refreshSession,
    isAuthorized,
    logout,
  }
})
