import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'

export type SettingsCardMode = 'editable' | 'read-only' | 'hidden'

function normalizeRole(role: unknown): string {
  return typeof role === 'string' ? role.trim().toUpperCase() : ''
}

export function useSettingsPermissions() {
  const authStore = useAuthStore()
  const projectStore = useProjectStore()

  /** Global system role (USER | SUPPORT | ADMIN) from session. */
  const normalizedGlobalRole = computed(() => normalizeRole(authStore.user?.role))
  /** Project membership role (Owner | Maintainer | …) for current board. */
  const normalizedProjectRole = computed(() => normalizeRole(projectStore.project?.role))

  const isAdmin = computed(
    () =>
      authStore.user?.permissions?.isAdmin === true || normalizedGlobalRole.value === 'ADMIN',
  )
  const isSupport = computed(() => normalizedGlobalRole.value === 'SUPPORT')

  const canManageProject = computed(() =>
    ['OWNER', 'MAINTAINER'].includes(normalizedProjectRole.value),
  )

  const canInviteMembers = computed(() => canManageProject.value)
  const canDeleteProject = computed(() => canManageProject.value)

  const isAuthenticated = computed(() => Boolean(authStore.user?.id))
  const canManageAgents = computed(() => isAuthenticated.value)
  const canUseAdmin = computed(
    () =>
      isAuthenticated.value &&
      (authStore.user?.permissions?.canManageRateLimits === true || isAdmin.value),
  )
  const canEditProfile = computed(() => isAuthenticated.value)

  const accountMode = computed<SettingsCardMode>(() =>
    canEditProfile.value ? 'editable' : 'hidden',
  )
  const workspaceMode = computed<SettingsCardMode>(() =>
    canManageProject.value ? 'editable' : 'read-only',
  )
  const adminMode = computed<SettingsCardMode>(() =>
    canUseAdmin.value ? 'editable' : 'read-only',
  )

  return {
    normalizedRole: normalizedGlobalRole,
    normalizedGlobalRole,
    normalizedProjectRole,
    isAdmin,
    isSupport,
    isAuthenticated,
    canManageProject,
    canInviteMembers,
    canDeleteProject,
    canManageAgents,
    canUseAdmin,
    canEditProfile,
    accountMode,
    workspaceMode,
    adminMode,
  }
}
