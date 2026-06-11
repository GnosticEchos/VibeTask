<script setup lang="ts">
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { useAdminRateLimitsQuery } from '@/composables/useAdminRateLimitsQuery'
import { useAdminUsersQuery } from '@/composables/useAdminUsersQuery'
import { useAdminSystemHealthQuery } from '@/composables/useAdminSystemHealthQuery'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import DraggableSettingsGrid from '@/components/settings/layout/DraggableSettingsGrid.vue'
import PlatformPlanningSkillsCard from '@/components/settings/admin/PlatformPlanningSkillsCard.vue'
import { useSettingsLayout } from '@/composables/useSettingsLayout'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { useAuthStore } from '@/stores/auth'
import { useLayoutStore } from '@/stores/layout'
import {
  toggleRateLimitConfig,
  updateRateLimitConfig,
  patchAdminUserRole,
  postAdminTemporaryPassword,
  getPlatformAgents,
  getPlatformAgentEndpointCatalog,
  createPlatformAgent,
  updatePlatformAgent,
  regeneratePlatformAgentKey,
  deletePlatformAgent,
  type PlatformAgent,
  type PlatformAgentEndpointOption,
  type AdminUserRow,
  type GlobalUserRole,
} from '@/api/v1/adminApi'

const { t } = useI18n()
const adminRateLimitsQuery = useAdminRateLimitsQuery()
const adminUsersQuery = useAdminUsersQuery()
const adminHealthQuery = useAdminSystemHealthQuery()
const platformAgentsQuery = useQuery({
  queryKey: ['admin', 'platform-agents'],
  queryFn: getPlatformAgents,
})
const platformAgentEndpointCatalogQuery = useQuery({
  queryKey: ['admin', 'platform-agent-endpoint-catalog'],
  queryFn: getPlatformAgentEndpointCatalog,
})
const settingsLayoutStore = useSettingsLayoutStore()
const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const queryClient = useQueryClient()

const tempPasswordDialog = ref<HTMLDialogElement | null>(null)
const platformKeyDialog = ref<HTMLDialogElement | null>(null)
const issuedTempPassword = ref<{
  password: string
  email: string
  displayName: string
  serverMessage: string
} | null>(null)
const issuedPlatformKey = ref<{
  key: string
  agentName: string
  mode: 'created' | 'regenerated'
} | null>(null)

const newPlatformAgentName = ref('')
const newPlatformAgentDescription = ref('')
const newPlatformAgentTargetUserId = ref<number | ''>('')
const newPlatformAgentSessionExpiry = ref<number>(86400)
const selectedPlatformAgentId = ref('')
const selectedPlatformAgentAllowedEndpoints = ref<string[]>([])
const platformEndpointToAdd = ref('')

const SESSION_EXPIRY_OPTIONS = [
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
] as const

watchEffect(() => {
  settingsLayoutStore.setUserId(String(authStore.user?.id || 'anonymous'))
})

const { layout, setLayout } = useSettingsLayout('admin')

const adminRateLimitsForbidden = computed(() => {
  if (!adminRateLimitsQuery.isError.value || !adminRateLimitsQuery.error.value) return false
  const err = adminRateLimitsQuery.error.value as { response?: { status?: number } }
  return err?.response?.status === 403
})

const adminRateLimitsRateLimited = computed(() => {
  if (!adminRateLimitsQuery.isError.value || !adminRateLimitsQuery.error.value) return false
  const err = adminRateLimitsQuery.error.value as { response?: { status?: number } }
  return err?.response?.status === 429
})

const adminUsersForbidden = computed(() => {
  if (!adminUsersQuery.isError.value || !adminUsersQuery.error.value) return false
  const err = adminUsersQuery.error.value as { response?: { status?: number } }
  return err?.response?.status === 403
})

const globalRoles: GlobalUserRole[] = ['USER', 'SUPPORT', 'ADMIN']

const adminUsers = computed(() => {
  const data = adminUsersQuery.data.value
  return Array.isArray(data) ? data : []
})

const platformAgents = computed<PlatformAgent[]>(() => {
  const data = platformAgentsQuery.data.value?.agents
  return Array.isArray(data) ? data : []
})

const platformAgentEndpointOptions = computed<PlatformAgentEndpointOption[]>(() => {
  const data = platformAgentEndpointCatalogQuery.data.value
  return Array.isArray(data) ? data : []
})

const selectedPlatformAgent = computed(() =>
  platformAgents.value.find((agent) => agent.id === selectedPlatformAgentId.value),
)

const hasMultiplePlatformAgents = computed(() => platformAgents.value.length > 1)

watch(
  platformAgents,
  (agents) => {
    if (!agents.length) {
      selectedPlatformAgentId.value = ''
      return
    }
    if (!selectedPlatformAgentId.value || !agents.some((agent) => agent.id === selectedPlatformAgentId.value)) {
      selectedPlatformAgentId.value = agents[0].id
    }
  },
  { immediate: true },
)

watch(
  selectedPlatformAgent,
  (agent) => {
    selectedPlatformAgentAllowedEndpoints.value = Array.isArray(agent?.metadata?.allowedReadEndpoints)
      ? [...(agent?.metadata?.allowedReadEndpoints as string[])]
      : []
  },
  { immediate: true },
)

function adminUserDisplayName(row: AdminUserRow): string {
  const parts = [row.name, row.surname].filter(Boolean) as string[]
  return parts.length > 0 ? parts.join(' ') : row.email
}

function healthServiceLabel(key: string): string {
  if (key === 'database') return t('settingsApp.admin.healthDatabase')
  if (key === 'websocket') return t('settingsApp.admin.healthWebsocket')
  return key
}

const hasBypassKeyConfigured = computed(
  () => Boolean(String(import.meta.env.VITE_RATE_LIMIT_ADMIN_BYPASS_KEY || '').trim()),
)

const rateLimits = computed(() => {
  const data = adminRateLimitsQuery.data.value
  return Array.isArray(data) ? data : []
})

const enabledCount = computed(() => rateLimits.value.filter((cfg) => cfg.enabled).length)

const hasEnabledRules = computed(() => enabledCount.value > 0)

const draftById = reactive<Record<number, { windowMs: number; maxRequests: number }>>({})

watch(
  rateLimits,
  (rows) => {
    const ids = new Set(rows.map((row) => row.id))
    for (const key of Object.keys(draftById)) {
      const id = Number(key)
      if (!ids.has(id)) delete draftById[id]
    }
    for (const row of rows) {
      draftById[row.id] = {
        windowMs: row.windowMs,
        maxRequests: row.maxRequests,
      }
    }
  },
  { immediate: true },
)

function hasDraftChanges(id: number): boolean {
  const row = rateLimits.value.find((cfg) => cfg.id === id)
  const draft = draftById[id]
  if (!row || !draft) return false
  return row.windowMs !== draft.windowMs || row.maxRequests !== draft.maxRequests
}

const toggleMutation = useMutation({
  mutationFn: (id: number) => toggleRateLimitConfig(id),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'rate-limits'] })
    layoutStore.openToast({ message: t('settingsApp.admin.toggleSuccess'), type: 'success' })
  },
  onError: (e: unknown) => {
    const status = (e as { response?: { status?: number } })?.response?.status
    layoutStore.openToast({
      message:
        status === 429
          ? t('settingsApp.admin.toggleError429')
          : t('settingsApp.admin.toggleError'),
      type: 'error',
    })
  },
})

const updateMutation = useMutation({
  mutationFn: ({
    id,
    windowMs,
    maxRequests,
  }: {
    id: number
    windowMs: number
    maxRequests: number
  }) => updateRateLimitConfig(id, { windowMs, maxRequests }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'rate-limits'] })
    layoutStore.openToast({ message: t('settingsApp.admin.updateSuccess'), type: 'success' })
  },
  onError: (e: unknown) => {
    const status = (e as { response?: { status?: number } })?.response?.status
    layoutStore.openToast({
      message:
        status === 429 ? t('settingsApp.admin.updateError429') : t('settingsApp.admin.updateError'),
      type: 'error',
    })
  },
})

const disableAllMutation = useMutation({
  mutationFn: async () => {
    const rows = rateLimits.value.filter((c) => c.enabled)
    for (const c of rows) {
      await updateRateLimitConfig(c.id, { enabled: false })
    }
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'rate-limits'] })
    layoutStore.openToast({ message: t('settingsApp.admin.disableAllSuccess'), type: 'success' })
  },
  onError: (e: unknown) => {
    const status = (e as { response?: { status?: number } })?.response?.status
    layoutStore.openToast({
      message:
        status === 429
          ? t('settingsApp.admin.disableAllError429')
          : t('settingsApp.admin.disableAllError'),
      type: 'error',
    })
  },
})

const rateLimitMutationsPending = computed(
  () =>
    toggleMutation.isPending.value ||
    updateMutation.isPending.value ||
    disableAllMutation.isPending.value,
)

const roleMutation = useMutation({
  mutationFn: ({ userId, role }: { userId: number; role: GlobalUserRole }) =>
    patchAdminUserRole(userId, role),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    layoutStore.openToast({ message: t('settingsApp.admin.userRoleUpdated'), type: 'success' })
  },
  onError: (e: unknown) => {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    const backend = err.response?.data?.error
    layoutStore.openToast({
      message:
        err.response?.status === 403 && backend
          ? backend
          : t('settingsApp.admin.userRoleUpdateError'),
      type: 'error',
    })
  },
})

const adminRateLimitsFetching = computed(() => adminRateLimitsQuery.isFetching.value)

async function toggleRule(id: number) {
  if (rateLimitMutationsPending.value) return
  await toggleMutation.mutateAsync(id)
}

async function saveRule(id: number) {
  if (rateLimitMutationsPending.value) return
  const draft = draftById[id]
  if (!draft) return
  if (draft.windowMs <= 0 || draft.maxRequests <= 0) {
    layoutStore.openToast({ message: t('settingsApp.admin.validationPositive'), type: 'error' })
    return
  }
  await updateMutation.mutateAsync({
    id,
    windowMs: Math.trunc(draft.windowMs),
    maxRequests: Math.trunc(draft.maxRequests),
  })
}

async function disableAllRules() {
  if (!hasEnabledRules.value || rateLimitMutationsPending.value) return
  await disableAllMutation.mutateAsync()
}

async function onUserRoleChange(row: AdminUserRow, nextRole: GlobalUserRole) {
  if (roleMutation.isPending.value || row.role === nextRole) return
  await roleMutation.mutateAsync({ userId: row.id, role: nextRole })
}

const tempPasswordMutation = useMutation({
  mutationFn: (userId: number) => postAdminTemporaryPassword(userId),
  onSuccess: (data, userId) => {
    const row = adminUsers.value.find((u) => u.id === userId)
    issuedTempPassword.value = {
      password: data.temporaryPassword,
      email: data.user.email,
      displayName: row ? adminUserDisplayName(row) : data.user.email,
      serverMessage: data.message,
    }
    tempPasswordDialog.value?.showModal()
  },
  onError: (e: unknown) => {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    const backend = err.response?.data?.error
    layoutStore.openToast({
      message: backend || t('settingsApp.admin.tempPasswordError'),
      type: 'error',
    })
  },
})

async function issueTemporaryPassword(row: AdminUserRow) {
  if (tempPasswordMutation.isPending.value || authStore.user?.id === row.id) return
  await tempPasswordMutation.mutateAsync(row.id)
}

async function copyIssuedTempPassword() {
  const pwd = issuedTempPassword.value?.password
  if (!pwd) return
  try {
    await navigator.clipboard.writeText(pwd)
    layoutStore.openToast({ message: t('settingsApp.admin.tempPasswordCopied'), type: 'success' })
  } catch {
    layoutStore.openToast({ message: t('settingsApp.agents.copyFailed'), type: 'error' })
  }
}

async function copyIssuedPlatformKey() {
  const key = issuedPlatformKey.value?.key
  if (!key) return
  try {
    await navigator.clipboard.writeText(key)
    layoutStore.openToast({ message: 'Platform key copied to clipboard.', type: 'success' })
  } catch {
    layoutStore.openToast({ message: t('settingsApp.agents.copyFailed'), type: 'error' })
  }
}

async function presentIssuedPlatformKey(payload: { key: string; agentName: string; mode: 'created' | 'regenerated' }) {
  issuedPlatformKey.value = payload
  platformKeyDialog.value?.showModal()
  try {
    await navigator.clipboard.writeText(payload.key)
    layoutStore.openToast({ message: 'Platform key copied to clipboard.', type: 'success' })
  } catch {
    layoutStore.openToast({ message: 'Platform key created. Copy it from the dialog.', type: 'warning' })
  }
}

const platformAgentCreateMutation = useMutation({
  mutationFn: () =>
    createPlatformAgent({
      name: newPlatformAgentName.value.trim(),
      targetUserId: Number(newPlatformAgentTargetUserId.value),
      description: newPlatformAgentDescription.value.trim() || undefined,
      sessionExpirySeconds: newPlatformAgentSessionExpiry.value,
      allowedReadEndpoints: [],
    }),
  onSuccess: async (data) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'platform-agents'] })
    newPlatformAgentName.value = ''
    newPlatformAgentDescription.value = ''
    newPlatformAgentTargetUserId.value = ''
    newPlatformAgentSessionExpiry.value = 86400
    selectedPlatformAgentId.value = data.agent.id
    if (data.apiKey) {
      await presentIssuedPlatformKey({ key: data.apiKey, agentName: data.agent.name, mode: 'created' })
    }
    layoutStore.openToast({ message: 'Platform agent created.', type: 'success' })
  },
  onError: () => {
    layoutStore.openToast({ message: 'Failed to create platform agent.', type: 'error' })
  },
})

const platformAgentUpdateMutation = useMutation({
  mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
    updatePlatformAgent(id, payload),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'platform-agents'] })
    layoutStore.openToast({ message: 'Platform agent updated.', type: 'success' })
  },
  onError: () => {
    layoutStore.openToast({ message: 'Failed to update platform agent.', type: 'error' })
  },
})

const platformAgentRegenerateMutation = useMutation({
  mutationFn: (id: string) => regeneratePlatformAgentKey(id),
  onSuccess: async (data) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'platform-agents'] })
    if (data.apiKey) {
      await presentIssuedPlatformKey({ key: data.apiKey, agentName: data.agent.name, mode: 'regenerated' })
    }
    layoutStore.openToast({ message: 'Platform key regenerated.', type: 'success' })
  },
  onError: () => {
    layoutStore.openToast({ message: 'Failed to regenerate platform key.', type: 'error' })
  },
})

const platformAgentDeleteMutation = useMutation({
  mutationFn: (id: string) => deletePlatformAgent(id),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'platform-agents'] })
    selectedPlatformAgentId.value = ''
    layoutStore.openToast({ message: 'Platform agent deleted.', type: 'success' })
  },
  onError: () => {
    layoutStore.openToast({ message: 'Failed to delete platform agent.', type: 'error' })
  },
})

async function createPlatformAgentFromForm() {
  if (!newPlatformAgentName.value.trim() || newPlatformAgentTargetUserId.value === '') return
  await platformAgentCreateMutation.mutateAsync()
}

async function savePlatformAgentEndpoints() {
  if (!selectedPlatformAgent.value) return
  await platformAgentUpdateMutation.mutateAsync({
    id: selectedPlatformAgent.value.id,
    payload: { allowedReadEndpoints: selectedPlatformAgentAllowedEndpoints.value },
  })
}

function addPlatformEndpointSelection() {
  const value = platformEndpointToAdd.value
  if (!value) return
  if (!selectedPlatformAgentAllowedEndpoints.value.includes(value)) {
    selectedPlatformAgentAllowedEndpoints.value = [...selectedPlatformAgentAllowedEndpoints.value, value]
  }
  platformEndpointToAdd.value = ''
}

function removePlatformEndpointSelection(path: string) {
  selectedPlatformAgentAllowedEndpoints.value = selectedPlatformAgentAllowedEndpoints.value.filter((p) => p !== path)
}

async function togglePlatformAgentActive(agent: PlatformAgent) {
  await platformAgentUpdateMutation.mutateAsync({
    id: agent.id,
    payload: { isActive: !agent.isActive },
  })
}

async function renamePlatformAgent(agent: PlatformAgent) {
  const nextName = window.prompt('Rename platform agent', agent.name)
  if (!nextName || !nextName.trim() || nextName.trim() === agent.name) return
  await platformAgentUpdateMutation.mutateAsync({ id: agent.id, payload: { name: nextName.trim() } })
}

async function regeneratePlatformAgent(agent: PlatformAgent) {
  const ok = window.confirm(`Regenerate key for ${agent.name}?`)
  if (!ok) return
  await platformAgentRegenerateMutation.mutateAsync(agent.id)
}

async function removePlatformAgent(agent: PlatformAgent) {
  const ok = window.confirm(`Delete platform agent ${agent.name}?`)
  if (!ok) return
  await platformAgentDeleteMutation.mutateAsync(agent.id)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-2xl font-semibold">{{ $t('settingsHub.admin.title') }}</h2>

    <DraggableSettingsGrid :layout="layout" :editable="settingsLayoutStore.isEditMode" @layoutChange="setLayout">
      <template #default="{ cardId }">
      <div v-if="cardId === 'admin.users'">
        <SettingsCard
          :title="$t('settingsHub.admin.usersTitle')"
          :subtitle="$t('settingsHub.admin.usersSubtitle')"
        >
          <p class="text-sm text-base-content/70 mb-3">{{ $t('settingsApp.admin.usersLead') }}</p>
          <div v-if="adminUsersQuery.isLoading.value && !adminUsersQuery.isFetched.value" class="flex justify-center py-6">
            <span class="loading loading-spinner loading-lg" aria-label="Loading users" />
          </div>
          <div v-else-if="adminUsersForbidden" class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-content">
            <span>{{ $t('settingsApp.admin.accessRequired') }}</span>
          </div>
          <div v-else-if="adminUsersQuery.isError.value" class="alert alert-error">
            <span>{{ $t('settingsApp.admin.usersLoadError') }}</span>
          </div>
          <div v-else-if="adminUsers.length === 0" class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80">
            {{ $t('settingsApp.admin.usersEmpty') }}
          </div>
          <div v-else class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>{{ $t('settingsApp.admin.userColName') }}</th>
                  <th>{{ $t('settingsApp.admin.userColEmail') }}</th>
                  <th>{{ $t('settingsApp.admin.userColRole') }}</th>
                  <th>{{ $t('settingsApp.admin.userColJoined') }}</th>
                  <th>{{ $t('settingsApp.admin.userColActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in adminUsers" :key="row.id">
                  <td>
                    {{ adminUserDisplayName(row) }}
                    <span v-if="authStore.user?.id === row.id" class="ml-1 text-xs opacity-60">({{ $t('settingsApp.admin.you') }})</span>
                  </td>
                  <td><span class="text-xs">{{ row.email }}</span></td>
                  <td>
                    <select
                      class="select select-bordered select-xs max-w-[9rem]"
                      :value="row.role"
                      :disabled="roleMutation.isPending.value"
                      @change="onUserRoleChange(row, ($event.target as HTMLSelectElement).value as GlobalUserRole)"
                    >
                      <option v-for="r in globalRoles" :key="r" :value="r">{{ r }}</option>
                    </select>
                  </td>
                  <td class="text-xs whitespace-nowrap">{{ new Date(row.createdAt).toLocaleString() }}</td>
                  <td>
                    <button
                      v-if="authStore.user?.id !== row.id"
                      type="button"
                      class="btn btn-ghost btn-xs whitespace-nowrap"
                      :disabled="tempPasswordMutation.isPending.value"
                      @click="issueTemporaryPassword(row)"
                    >
                      {{ $t('settingsApp.admin.tempPasswordIssue') }}
                    </button>
                    <span v-else class="text-xs text-base-content/50">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SettingsCard>
      </div>

      <div v-else-if="cardId === 'admin.systemHealth'">
        <SettingsCard
          :title="$t('settingsHub.admin.systemHealthTitle')"
          :subtitle="$t('settingsHub.admin.systemHealthSubtitle')"
        >
          <div v-if="adminHealthQuery.isLoading.value && !adminHealthQuery.isFetched.value" class="flex justify-center py-6">
            <span class="loading loading-spinner loading-md" aria-label="Loading health" />
          </div>
          <div v-else-if="adminHealthQuery.isError.value" class="alert alert-warning text-sm">
            <span>{{ $t('settingsApp.admin.healthLoadError') }}</span>
            <button type="button" class="btn btn-ghost btn-xs ml-2" @click="adminHealthQuery.refetch()">
              {{ $t('settingsApp.admin.rateLimitRetry') }}
            </button>
          </div>
          <div v-else-if="adminHealthQuery.data.value" class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="badge"
                :class="adminHealthQuery.data.value.status === 'ok' ? 'badge-success' : 'badge-warning'"
              >
                {{ adminHealthQuery.data.value.status === 'ok' ? $t('settingsApp.admin.healthOk') : $t('settingsApp.admin.healthDegraded') }}
              </span>
              <span class="text-xs text-base-content/60 font-mono">{{ adminHealthQuery.data.value.timestamp }}</span>
            </div>
            <ul class="text-sm space-y-2 border border-base-300/60 rounded-lg p-3 bg-base-200/40">
              <li
                v-for="(svc, key) in adminHealthQuery.data.value.services"
                :key="key"
                class="flex flex-wrap justify-between gap-2"
              >
                <span>{{ healthServiceLabel(String(key)) }}</span>
                <span
                  class="badge badge-sm"
                  :class="
                    svc.status === 'ok'
                      ? 'badge-success'
                      : svc.status === 'unknown'
                        ? 'badge-ghost'
                        : 'badge-error'
                  "
                >
                  {{ svc.status }}
                </span>
              </li>
            </ul>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="adminHealthQuery.isFetching.value" @click="adminHealthQuery.refetch()">
              {{ $t('settingsApp.admin.healthRefresh') }}
            </button>
          </div>
        </SettingsCard>
      </div>

      <div v-else-if="cardId === 'admin.rateLimits'">
        <SettingsCard
          :title="$t('settingsHub.admin.rateLimitsTitle')"
          :subtitle="$t('settingsApp.admin.lead')"
        >
          <p class="text-sm text-base-content/70">{{ $t('settingsApp.admin.body') }}</p>

          <div v-if="adminRateLimitsQuery.isLoading.value && !adminRateLimitsQuery.isFetched.value" class="flex justify-center py-6">
            <span class="loading loading-spinner loading-lg" aria-label="Loading rate limits" />
          </div>
          <div v-else-if="adminRateLimitsForbidden" class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-content">
            <span>{{ $t('settingsApp.admin.accessRequired') }}</span>
          </div>
          <div v-else-if="adminRateLimitsRateLimited" class="rounded-lg border border-warning/50 bg-warning/10 px-3 py-3 text-sm text-warning-content">
            <p class="font-medium">{{ $t('settingsApp.admin.rateLimitHitTitle') }}</p>
            <p class="mt-1 opacity-90">{{ $t('settingsApp.admin.rateLimitHitBody') }}</p>
            <p v-if="!hasBypassKeyConfigured" class="mt-2 text-xs opacity-80">
              {{ $t('settingsApp.admin.rateLimitBypassHint') }}
            </p>
            <button
              type="button"
              class="btn btn-warning btn-sm mt-3"
              :disabled="adminRateLimitsFetching"
              @click="adminRateLimitsQuery.refetch()"
            >
              {{ $t('settingsApp.admin.rateLimitRetry') }}
            </button>
          </div>
          <div v-else-if="adminRateLimitsQuery.isError.value" class="alert alert-error">
            <span>{{ $t('settingsApp.agents.loadError') }}</span>
          </div>
          <div v-else-if="rateLimits.length > 0" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-base-content/60 max-w-prose">{{ $t('settingsApp.admin.disableAllHint') }}</p>
              <button
                type="button"
                class="btn btn-warning btn-sm"
                :disabled="!hasEnabledRules || rateLimitMutationsPending"
                @click="disableAllRules"
              >
                {{ $t('settingsApp.admin.disableAllRules') }}
              </button>
            </div>
            <div class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>{{ $t('settingsApp.admin.rateLimitName') }}</th>
                  <th>{{ $t('settingsApp.admin.rateLimitPattern') }}</th>
                  <th>{{ $t('settingsApp.admin.rateLimitWindow') }}</th>
                  <th>{{ $t('settingsApp.admin.rateLimitMax') }}</th>
                  <th>{{ $t('settingsApp.admin.rateLimitEnabled') }}</th>
                  <th>{{ $t('settingsApp.admin.rateLimitActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cfg in rateLimits" :key="cfg.id">
                  <td>{{ cfg.name }}</td>
                  <td><code class="text-xs">{{ cfg.endpointPattern }}</code></td>
                  <td>
                    <input
                      v-model.number="draftById[cfg.id].windowMs"
                      type="number"
                      min="1"
                      class="input input-bordered input-xs w-28"
                    />
                  </td>
                  <td>
                    <input
                      v-model.number="draftById[cfg.id].maxRequests"
                      type="number"
                      min="1"
                      class="input input-bordered input-xs w-24"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="cfg.enabled ? 'btn-success' : 'btn-ghost'"
                      :disabled="rateLimitMutationsPending"
                      @click="toggleRule(cfg.id)"
                    >
                      {{ cfg.enabled ? $t('settingsApp.agents.statusActive') : $t('settingsApp.agents.statusDisabled') }}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-primary btn-xs"
                      :disabled="!hasDraftChanges(cfg.id) || rateLimitMutationsPending"
                      @click="saveRule(cfg.id)"
                    >
                      {{ $t('settingsApp.admin.saveRule') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          <div v-else class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80">
            {{ $t('settingsHub.admin.empty') }}
          </div>
        </SettingsCard>
      </div>

      <SettingsCard v-else-if="cardId === 'admin.platformAgents'"
        title="Platform Agent Registry"
        subtitle="Tier 0 defaults to /health only. Select additional read-only agent endpoints per key."
      >
        <div class="space-y-3">
          <div class="grid gap-2 md:grid-cols-[2fr,2fr,3fr,auto]">
            <input
              v-model="newPlatformAgentName"
              type="text"
              class="input input-bordered input-sm"
              placeholder="Platform agent name"
            >
            <select v-model="newPlatformAgentTargetUserId" class="select select-bordered select-sm">
              <option value="">Target user...</option>
              <option
                v-for="user in adminUsers"
                :key="user.id"
                :value="user.id"
              >
                {{ adminUserDisplayName(user) }}
              </option>
            </select>
            <input
              v-model="newPlatformAgentDescription"
              type="text"
              class="input input-bordered input-sm"
              placeholder="Description (optional)"
            >
            <div class="flex gap-1">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="platformAgentCreateMutation.isPending.value || !newPlatformAgentName.trim() || newPlatformAgentTargetUserId === ''"
                @click="createPlatformAgentFromForm"
              >
                Create
              </button>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <span class="text-xs text-base-content/60">Session expiry:</span>
            <select v-model="newPlatformAgentSessionExpiry" class="select select-bordered select-xs">
              <option
                v-for="opt in SESSION_EXPIRY_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div v-if="platformAgentsQuery.isLoading.value && !platformAgentsQuery.isFetched.value" class="flex justify-center py-4">
            <span class="loading loading-spinner loading-md" aria-label="Loading platform agents" />
          </div>
          <div v-else-if="platformAgentsQuery.isError.value" class="alert alert-error text-sm">
            Failed to load platform agents.
          </div>
          <div v-else-if="platformAgents.length === 0" class="text-sm text-base-content/70">
            No platform agents configured.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="agent in platformAgents"
              :key="agent.id"
              class="rounded-lg border border-base-300/70 bg-base-200/50 px-3 py-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-medium">{{ agent.name }}</p>
                  <p class="text-xs text-base-content/60">{{ agent.metadata?.description || 'No description' }}</p>
                  <p v-if="agent.targetUser" class="text-xs text-base-content/50 mt-1">
                    Target user: {{ agent.targetUser.name || agent.targetUser.email }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="badge badge-sm" :class="agent.isActive ? 'badge-success' : 'badge-ghost'">{{ agent.isActive ? 'Active' : 'Disabled' }}</span>
                  <span class="badge badge-sm badge-outline">Expires: {{ agent.expiresAt ? new Date(agent.expiresAt).toLocaleDateString() : 'Never' }}</span>
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button type="button" class="btn btn-ghost btn-xs" @click="renamePlatformAgent(agent)">Rename</button>
                <button type="button" class="btn btn-ghost btn-xs" @click="togglePlatformAgentActive(agent)">{{ agent.isActive ? 'Disable' : 'Enable' }}</button>
                <button type="button" class="btn btn-ghost btn-xs" @click="regeneratePlatformAgent(agent)">Regenerate Key</button>
                <button type="button" class="btn btn-error btn-outline btn-xs" @click="removePlatformAgent(agent)">Delete</button>
                <button
                  type="button"
                  class="btn btn-outline btn-xs"
                  :class="selectedPlatformAgentId === agent.id ? 'btn-primary' : ''"
                  @click="selectedPlatformAgentId = agent.id"
                >
                  {{ selectedPlatformAgentId === agent.id ? 'Selected' : 'Select' }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="selectedPlatformAgent" class="rounded-lg border border-base-300 p-3 space-y-3">
            <div class="flex flex-wrap items-end justify-between gap-2">
              <div class="space-y-1">
                <p class="text-sm font-medium">Allowed read-only endpoints</p>
                <p class="text-xs text-base-content/60">Always allowed: GET /health</p>
              </div>
              <div class="flex items-center gap-2">
                <div class="text-xs text-base-content/50">
                  Session:
                  <span class="font-mono" :title="`${selectedPlatformAgent.sessionExpirySeconds / 3600}h expiry`">
                    {{ selectedPlatformAgent.sessionExpirySeconds / 3600 }}h
                  </span>
                  <span v-if="selectedPlatformAgent.targetUser" class="ml-2">
                    User: {{ selectedPlatformAgent.targetUser.name || selectedPlatformAgent.targetUser.email }}
                  </span>
                </div>
                <div class="w-full sm:w-auto sm:min-w-[18rem]">
                  <label class="label py-0">
                    <span class="label-text text-xs">Platform agent</span>
                  </label>
                  <select v-model="selectedPlatformAgentId" class="select select-bordered select-sm w-full">
                    <option v-for="agent in platformAgents" :key="agent.id" :value="agent.id">
                      {{ agent.name }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div v-if="hasMultiplePlatformAgents" class="text-xs text-base-content/60">
              Use the selector to switch endpoint access view between platform agents.
            </div>

            <div class="grid gap-2 md:grid-cols-[1fr,auto]">
              <select v-model="platformEndpointToAdd" class="select select-bordered select-sm w-full">
                <option value="">Select endpoint to allow</option>
                <option
                  v-for="option in platformAgentEndpointOptions.filter((opt) => !selectedPlatformAgentAllowedEndpoints.includes(opt.path))"
                  :key="option.path"
                  :value="option.path"
                >
                  {{ option.path }} — {{ option.label }}
                </option>
              </select>
              <button type="button" class="btn btn-outline btn-sm" :disabled="!platformEndpointToAdd" @click="addPlatformEndpointSelection">
                Add
              </button>
            </div>

            <div v-if="selectedPlatformAgentAllowedEndpoints.length" class="flex flex-wrap gap-2">
              <span
                v-for="path in selectedPlatformAgentAllowedEndpoints"
                :key="path"
                class="badge badge-lg gap-2"
              >
                <code>{{ path }}</code>
                <button type="button" class="btn btn-ghost btn-xs px-1" @click="removePlatformEndpointSelection(path)">✕</button>
              </span>
            </div>
            <p v-else class="text-xs text-base-content/60">No additional endpoints selected.</p>

            <div class="flex justify-end">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="platformAgentUpdateMutation.isPending.value"
                @click="savePlatformAgentEndpoints"
              >
                Save endpoint access
              </button>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard v-else-if="cardId === 'admin.summary'"
        :title="$t('settingsHub.admin.summaryTitle')"
        :subtitle="$t('settingsHub.admin.summarySubtitle')"
      >
        <div class="stats stats-vertical shadow-sm border border-base-300/60 bg-base-200/40">
          <div v-if="!adminUsersForbidden && adminUsersQuery.isFetched.value" class="stat py-3 px-4">
            <div class="stat-title text-xs">{{ $t('settingsHub.admin.totalUsers') }}</div>
            <div class="stat-value text-2xl">{{ adminUsers.length }}</div>
          </div>
          <div class="stat py-3 px-4">
            <div class="stat-title text-xs">{{ $t('settingsHub.admin.totalRules') }}</div>
            <div class="stat-value text-2xl">{{ rateLimits.length }}</div>
          </div>
          <div class="stat py-3 px-4">
            <div class="stat-title text-xs">{{ $t('settingsHub.admin.enabledRules') }}</div>
            <div class="stat-value text-2xl text-success">{{ enabledCount }}</div>
          </div>
        </div>
      </SettingsCard>

      <PlatformPlanningSkillsCard v-else-if="cardId === 'admin.planningSkills'" />

      <SettingsCard v-else-if="cardId === 'admin.roadmapSecurity'"
        :title="$t('settingsHub.admin.roadmapSecurityTitle')"
        :subtitle="$t('settingsHub.admin.roadmapSecuritySubtitle')"
      >
        <ul class="list-disc list-inside text-sm text-base-content/80 space-y-1">
          <li>{{ $t('settingsHub.admin.roadmapSecurityItem1') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapSecurityItem2') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapSecurityItem3') }}</li>
        </ul>
      </SettingsCard>

      <SettingsCard v-else-if="cardId === 'admin.roadmapCompliance'"
        :title="$t('settingsHub.admin.roadmapComplianceTitle')"
        :subtitle="$t('settingsHub.admin.roadmapComplianceSubtitle')"
      >
        <ul class="list-disc list-inside text-sm text-base-content/80 space-y-1">
          <li>{{ $t('settingsHub.admin.roadmapComplianceItem1') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapComplianceItem2') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapComplianceItem3') }}</li>
        </ul>
      </SettingsCard>

      <SettingsCard v-else-if="cardId === 'admin.roadmapPlatform'"
        :title="$t('settingsHub.admin.roadmapPlatformTitle')"
        :subtitle="$t('settingsHub.admin.roadmapPlatformSubtitle')"
      >
        <ul class="list-disc list-inside text-sm text-base-content/80 space-y-1">
          <li>{{ $t('settingsHub.admin.roadmapPlatformItem1') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapPlatformItem2') }}</li>
          <li>{{ $t('settingsHub.admin.roadmapPlatformItem3') }}</li>
        </ul>
      </SettingsCard>
      </template>
    </DraggableSettingsGrid>

    <dialog
      ref="platformKeyDialog"
      class="modal"
      @close="issuedPlatformKey = null"
    >
      <div class="modal-box max-w-xl">
        <h3 class="font-bold text-lg">
          {{ issuedPlatformKey?.mode === 'regenerated' ? 'Platform key regenerated' : 'Platform key created' }}
        </h3>
        <p v-if="issuedPlatformKey" class="text-sm text-base-content/80 py-2">
          {{ issuedPlatformKey.agentName }}
        </p>
        <p class="text-sm text-warning">This secret is shown once. Store it securely now.</p>
        <div class="my-3">
          <code
            v-if="issuedPlatformKey"
            class="block w-full break-all rounded-lg bg-base-300 px-3 py-2 text-sm font-mono"
          >{{ issuedPlatformKey.key }}</code>
        </div>
        <div class="modal-action flex-wrap gap-2">
          <button type="button" class="btn btn-outline btn-sm" @click="copyIssuedPlatformKey">
            Copy key
          </button>
          <form method="dialog">
            <button type="submit" class="btn btn-primary btn-sm">
              Close
            </button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">{{ $t('core.close') }}</button>
      </form>
    </dialog>

    <dialog
      ref="tempPasswordDialog"
      class="modal"
      @close="issuedTempPassword = null"
    >
      <div class="modal-box max-w-lg">
        <h3 class="font-bold text-lg">{{ $t('settingsApp.admin.tempPasswordDialogTitle') }}</h3>
        <p v-if="issuedTempPassword" class="text-sm text-base-content/80 py-2">
          {{ issuedTempPassword.displayName }}
          <span class="text-base-content/60"> · {{ issuedTempPassword.email }}</span>
        </p>
        <p class="text-sm text-warning">{{ $t('settingsApp.admin.tempPasswordWarning') }}</p>
        <p v-if="issuedTempPassword?.serverMessage" class="text-xs text-base-content/60 mt-2">
          {{ issuedTempPassword.serverMessage }}
        </p>
        <div class="my-3">
          <code
            v-if="issuedTempPassword"
            class="block w-full break-all rounded-lg bg-base-300 px-3 py-2 text-sm font-mono"
          >{{ issuedTempPassword.password }}</code>
        </div>
        <div class="modal-action flex-wrap gap-2">
          <button type="button" class="btn btn-outline btn-sm" @click="copyIssuedTempPassword">
            {{ $t('settingsApp.admin.tempPasswordCopy') }}
          </button>
          <form method="dialog">
            <button type="submit" class="btn btn-primary btn-sm">
              {{ $t('settingsApp.admin.tempPasswordClose') }}
            </button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">{{ $t('core.close') }}</button>
      </form>
    </dialog>
  </div>
</template>
