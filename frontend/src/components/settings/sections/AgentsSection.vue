<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLayoutStore } from '@/stores/layout'
import { useAgentsQuery } from '@/composables/useAgentsQuery'
import { useAgentDelegationsQuery } from '@/composables/useAgentDelegationsQuery'
import { useProjectsQuery } from '@/composables/useProjectsQuery'
import { useColumnsQuery } from '@/composables/useColumnsQuery'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import type { Agent, AgentDelegation, AgentPermissionLevel } from '@/types/agentTypes'
import type { iColumn } from '@/types/columnTypes'
import DraggableSettingsGrid from '@/components/settings/layout/DraggableSettingsGrid.vue'
import { useSettingsLayout } from '@/composables/useSettingsLayout'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { useAuthStore } from '@/stores/auth'
import {
  createDelegation,
  deleteAgent,
  deleteDelegation,
  updateDelegation,
} from '@/api/v1/agentsApi'
import { resolveAgentAvatarUrl } from '@/utils/agentAvatars'
import { parseAgentMetadata } from '@/utils/agentMetadata'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const agentsQuery = useAgentsQuery()
const settingsLayoutStore = useSettingsLayoutStore()
const authStore = useAuthStore()
const projectsQuery = useProjectsQuery()

watch(
  () => authStore.user?.id,
  (id) => {
    settingsLayoutStore.setUserId(String(id || 'anonymous'))
  },
  { immediate: true },
)

const agents = computed<Agent[]>(() => {
  const data = agentsQuery.data.value?.agents
  return Array.isArray(data) ? data : []
})

const agentsTotal = computed(() => agentsQuery.data.value?.total ?? agents.value.length)
const activeCount = computed(() => agentsQuery.data.value?.activeTotal ?? agents.value.filter((a) => a.isActive).length)
const agentsListTruncated = computed(() => agentsTotal.value > agents.value.length)

const showAgentsLoadError = computed(() => agentsQuery.isError.value && agentsQuery.data.value == null)
const showDelegationsLoadError = computed(
  () => delegationsQuery.isError.value && delegationsQuery.data.value == null,
)
const { layout, setLayout } = useSettingsLayout('agents')

const selectedAgentId = ref<string | undefined>(undefined)

watch(
  agents,
  (list) => {
    if (!list.length) {
      selectedAgentId.value = undefined
      return
    }
    if (!selectedAgentId.value || !list.some((a) => a.id === selectedAgentId.value)) {
      selectedAgentId.value = list[0]!.id
    }
  },
  { immediate: true },
)

const delegationsQuery = useAgentDelegationsQuery(selectedAgentId)

const delegations = computed(() => delegationsQuery.data.value ?? [])
const sortedDelegations = computed(() => {
  const d = delegations.value
  return [...d].sort((a, b) => {
    const ac = a.isActive === false ? 1 : 0
    const bc = b.isActive === false ? 1 : 0
    if (ac !== bc) return ac - bc
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
})

const projects = computed(() => {
  const data = projectsQuery.data.value
  return Array.isArray(data) ? data : []
})

const delegatedProjectIds = computed(
  () => new Set(delegations.value.map((d) => Number(d.projectId))),
)
const availableProjects = computed(() => projects.value.filter((p) => !delegatedProjectIds.value.has(p.id)))

/** Keeps selects in sync with server data without Vue clobbering the user's choice during PATCH. */
const delegationPermUi = reactive<Record<string, AgentPermissionLevel>>({})

watch(
  () => delegations.value,
  (list) => {
    const nextIds = new Set(list.map((d) => d.id))
    for (const id of Object.keys(delegationPermUi)) {
      if (!nextIds.has(id)) delete delegationPermUi[id]
    }
    for (const d of list) {
      delegationPermUi[d.id] = d.permissionLevel
    }
  },
  { immediate: true },
)

const addProjectId = ref<number | ''>('')
const newPermission = ref<AgentPermissionLevel>('VIEWER')
const newDelegationMode = ref<'FULL' | 'COLUMN_BOUND'>('FULL')
const newRestrictedColumnId = ref<number | ''>('')
const newAllowedMoveRange = ref<number>(1)
const addBusy = ref(false)

// Columns query for the selected project (used when COLUMN_BOUND mode is selected)
const columnsQueryProjectId = computed(() => {
  const pid = newDelegationMode.value === 'COLUMN_BOUND' && addProjectId.value !== '' ? Number(addProjectId.value) : 0
  return pid
})
const columnsQuery = useColumnsQuery(columnsQueryProjectId)
const availableColumns = computed<iColumn[]>(() => {
  const data = columnsQuery.data.value
  return Array.isArray(data) ? data : []
})

function apiErr(e: unknown, fallback: string): string {
  const d = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return d?.message || d?.error || (e as Error).message || fallback
}

function openCreateAgentDialog() {
  layoutStore.openDialog({
    title: '',
    component: 'CreateAgentDialog',
  })
}

function openEditAgentDialog(agent: Agent) {
  layoutStore.openDialog({
    title: '',
    component: 'EditAgentDialog',
    item: agent,
  })
}

function openRegenerateKeyDialog(agent: Agent) {
  layoutStore.openDialog({
    title: '',
    component: 'RegenerateAgentKeyDialog',
    item: agent,
  })
}

async function onDeleteAgent(agent: Agent) {
  const ok = window.confirm(t('settingsApp.agents.deleteConfirm', { name: agent.name || agent.id }))
  if (!ok) return
  try {
    await deleteAgent(agent.id)
    await agentsQuery.refetch()
    layoutStore.openToast({ message: t('settingsApp.agents.deleted'), type: 'success' })
  } catch (e: unknown) {
    layoutStore.openToast({ message: apiErr(e, t('settingsApp.agents.deleteError')), type: 'error' })
  }
}

async function onAddDelegation() {
  const aid = selectedAgentId.value
  const pid = addProjectId.value
  if (!aid || pid === '' || addBusy.value) return
  addBusy.value = true
  try {
    const payload: Parameters<typeof createDelegation>[1] = {
      projectId: Number(pid),
      permissionLevel: newPermission.value,
    }
    if (newDelegationMode.value === 'COLUMN_BOUND') {
      payload.delegationMode = 'COLUMN_BOUND'
      if (newRestrictedColumnId.value !== '') {
        payload.restrictedColumnId = Number(newRestrictedColumnId.value)
      }
      payload.allowedMoveRange = newAllowedMoveRange.value
    }
    await createDelegation(aid, payload)
    await delegationsQuery.refetch()
    addProjectId.value = ''
    newDelegationMode.value = 'FULL'
    newRestrictedColumnId.value = ''
    newAllowedMoveRange.value = 1
    layoutStore.openToast({ message: t('settingsApp.agents.delegationAdded'), type: 'success' })
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status
    const msg =
      status === 409
        ? t('settingsApp.agents.delegationConflict')
        : apiErr(e, t('settingsApp.agents.delegationAddError'))
    layoutStore.openToast({ message: msg, type: 'error' })
  } finally {
    addBusy.value = false
  }
}

async function onDelegationPermissionChange(d: AgentDelegation) {
  const aid = selectedAgentId.value
  const level = delegationPermUi[d.id]
  if (!aid || d.isActive === false || level == null || level === d.permissionLevel) return
  try {
    await updateDelegation(aid, d.id, { permissionLevel: level })
    await delegationsQuery.refetch()
    layoutStore.openToast({ message: t('settingsApp.agents.delegationUpdated'), type: 'success' })
  } catch (e: unknown) {
    delegationPermUi[d.id] = d.permissionLevel
    layoutStore.openToast({ message: apiErr(e, t('settingsApp.agents.delegationUpdateError')), type: 'error' })
  }
}

async function onRevokeDelegation(d: AgentDelegation) {
  const aid = selectedAgentId.value
  if (!aid || d.isActive === false) return
  const projectLabel = d.projectName || d.projectPrefix || String(d.projectId)
  const ok = window.confirm(t('settingsApp.agents.revokeConfirm', { project: projectLabel }))
  if (!ok) return
  try {
    await deleteDelegation(aid, d.id)
    await delegationsQuery.refetch()
    layoutStore.openToast({ message: t('settingsApp.agents.delegationRevoked'), type: 'success' })
  } catch (e: unknown) {
    layoutStore.openToast({ message: apiErr(e, t('settingsApp.agents.delegationRevokeError')), type: 'error' })
  }
}

const canSubmitDelegation = computed(() => {
  const baseValid =
    Boolean(selectedAgentId.value) &&
    addProjectId.value !== '' &&
    !addBusy.value &&
    !projectsQuery.isLoading.value
  if (!baseValid) return false
  if (newDelegationMode.value === 'COLUMN_BOUND') {
    // Column-bound requires a column selection, but we allow submit while loading columns
    // The button itself has additional validation for this
    return true
  }
  return true
})

function agentAvatarSrc(agent: Agent): string | null {
  const slug = parseAgentMetadata(agent).avatarSlug
  return resolveAgentAvatarUrl(slug == null ? null : String(slug))
}

function agentDescription(agent: Agent): string {
  const d = parseAgentMetadata(agent).description
  if (d == null) return ''
  return typeof d === 'string' ? d : String(d)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-2xl font-semibold">{{ $t('settingsHub.agents.title') }}</h2>

    <DraggableSettingsGrid :layout="layout" :editable="settingsLayoutStore.isEditMode" @layoutChange="setLayout">
      <template #default="{ cardId }">
        <div v-if="cardId === 'agents.list'">
          <SettingsCard
            :title="$t('settingsHub.agents.listTitle')"
            :subtitle="$t('settingsApp.agents.registrySubtitle')"
          >
            <div v-if="agentsQuery.isLoading && !agentsQuery.isFetched" class="flex items-center justify-center py-8">
              <span class="loading loading-spinner loading-lg" aria-label="Loading agents" />
            </div>
            <div v-else-if="showAgentsLoadError" class="alert alert-error">
              <span>{{ $t('settingsApp.agents.loadError') }}</span>
            </div>
            <div v-else>
              <div
                v-if="agentsListTruncated && agents.length > 0"
                class="alert alert-info text-sm mb-3"
              >
                {{ $t('settingsApp.agents.listTruncatedHint', { shown: agents.length, total: agentsTotal }) }}
              </div>
              <div v-if="agents.length === 0" class="flex flex-col items-start gap-2">
                <p class="text-base-content/80">{{ $t('settingsApp.agents.emptyTitle') }}</p>
                <p class="text-sm text-base-content/60">{{ $t('settingsApp.agents.emptyBody') }}</p>
              </div>
              <ul v-else class="divide-y divide-base-200">
                <li
                  v-for="agent in agents"
                  :key="agent.id"
                  class="py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div class="flex items-start gap-3 min-w-0">
                    <div class="avatar shrink-0">
                      <div
                        v-if="agentAvatarSrc(agent)"
                        class="w-10 h-10 rounded-full bg-primary p-1.5 flex items-center justify-center ring-2 ring-primary ring-offset-2 ring-offset-base-100"
                      >
                        <img
                          :src="agentAvatarSrc(agent)!"
                          alt=""
                          class="w-full h-full object-contain"
                        />
                      </div>
                      <div
                        v-else
                        class="w-10 h-10 rounded-full bg-primary text-primary-content flex items-center justify-center ring-2 ring-primary ring-offset-2 ring-offset-base-100"
                      >
                        <span class="text-sm font-semibold">
                          {{ agent.name?.[0]?.toUpperCase() || '?' }}
                        </span>
                      </div>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <p class="font-medium truncate">{{ agent.name }}</p>
                      <p class="text-xs text-base-content/60 truncate">
                        {{ agentDescription(agent) || $t('settingsApp.agents.noDescription') }}
                      </p>
                      <div class="mt-1 flex flex-wrap gap-2 text-xs">
                        <span class="badge badge-sm badge-outline">
                          {{ agent.isActive ? $t('settingsApp.agents.statusActive') : $t('settingsApp.agents.statusDisabled') }}
                        </span>
                        <span v-if="agent.expiresAt" class="badge badge-sm badge-outline">
                          {{ $t('settingsApp.agents.expiresLabel') }}
                        </span>
                        <span v-else class="badge badge-sm badge-outline">
                          {{ $t('settingsApp.agents.noExpiry') }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-2 sm:items-end shrink-0">
                    <span class="font-mono text-[10px] uppercase text-base-content/60">{{ agent.prefix }}</span>
                    <div class="flex flex-wrap gap-1 justify-end">
                      <button type="button" class="btn btn-ghost btn-xs" @click="openEditAgentDialog(agent)">
                        {{ $t('settingsApp.agents.edit') }}
                      </button>
                      <button type="button" class="btn btn-ghost btn-xs" @click="openRegenerateKeyDialog(agent)">
                        {{ $t('settingsApp.agents.regenerateKey') }}
                      </button>
                      <button type="button" class="btn btn-ghost btn-xs text-error" @click="onDeleteAgent(agent)">
                        {{ $t('actions.delete') }}
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </SettingsCard>
        </div>

        <SettingsCard
          v-else-if="cardId === 'agents.create'"
          :title="$t('settingsApp.agents.createAgent')"
          :subtitle="$t('settingsHub.agents.createSubtitle')"
        >
          <p class="text-sm text-base-content/70">{{ $t('settingsApp.agents.emptyBody') }}</p>
          <template #actions>
            <button type="button" class="btn btn-primary btn-sm" @click="openCreateAgentDialog">
              {{ $t('settingsApp.agents.createAgent') }}
            </button>
          </template>
        </SettingsCard>

        <SettingsCard
          v-else-if="cardId === 'agents.summary'"
          :title="$t('settingsHub.agents.summaryTitle')"
          :subtitle="$t('settingsHub.agents.summarySubtitle')"
        >
          <div class="stats stats-vertical lg:stats-horizontal shadow-sm border border-base-300/60 bg-base-200/40">
            <div class="stat py-3 px-4">
              <div class="stat-title text-xs">{{ $t('settingsHub.agents.total') }}</div>
              <div class="stat-value text-2xl">{{ agentsTotal }}</div>
            </div>
            <div class="stat py-3 px-4">
              <div class="stat-title text-xs">{{ $t('settingsHub.agents.active') }}</div>
              <div class="stat-value text-2xl text-success">{{ activeCount }}</div>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          v-else-if="cardId === 'agents.delegations'"
          :title="$t('settingsHub.agents.delegationsTitle')"
          :subtitle="$t('settingsHub.agents.delegationsSubtitle')"
        >
          <div v-if="!agents.length" class="text-sm text-base-content/70">
            {{ $t('settingsApp.agents.emptyTitle') }}
          </div>
          <div v-else class="flex flex-col gap-4">
            <div class="form-control w-full max-w-md">
              <label class="label pt-0" for="delegation-agent-select">
                <span class="label-text">{{ $t('settingsApp.agents.selectAgent') }}</span>
              </label>
              <select
                id="delegation-agent-select"
                v-model="selectedAgentId"
                class="select select-bordered select-sm w-full"
              >
                <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>

            <div v-if="delegationsQuery.isLoading && !delegationsQuery.isFetched" class="flex items-center justify-center py-6">
              <span class="loading loading-spinner loading-md" aria-label="Loading delegations" />
            </div>
            <div v-else-if="showDelegationsLoadError" class="alert alert-error text-sm">
              <span>{{ $t('settingsApp.agents.delegationsLoadError') }}</span>
            </div>
            <div v-else class="flex flex-col gap-4">
              <div class="rounded-lg border border-base-300/60 bg-base-200/30 p-3 flex flex-col gap-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  {{ $t('settingsApp.agents.addDelegation') }}
                </p>
                <div v-if="projectsQuery.isLoading && !projectsQuery.isFetched" class="flex justify-center py-2">
                  <span class="loading loading-spinner loading-sm" />
                </div>
                <div v-else-if="!availableProjects.length" class="text-sm text-base-content/70">
                  {{ $t('settingsApp.agents.noProjectsForDelegation') }}
                </div>
                <div v-else class="flex flex-col gap-3">
                  <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div class="form-control flex-1 min-w-0">
                      <label class="label py-0" for="delegation-project-select">
                        <span class="label-text text-xs">{{ $t('settingsApp.agents.selectProject') }}</span>
                      </label>
                      <select
                        id="delegation-project-select"
                        v-model="addProjectId"
                        class="select select-bordered select-sm w-full"
                      >
                        <option value="">{{ $t('settingsApp.agents.selectProject') }}</option>
                        <option v-for="p in availableProjects" :key="p.id" :value="p.id">
                          {{ p.name }} ({{ p.prefix }})
                        </option>
                      </select>
                    </div>
                    <div class="form-control w-full sm:w-40">
                      <label class="label py-0" for="delegation-perm-new">
                        <span class="label-text text-xs">{{ $t('settingsApp.agents.delegationPermission') }}</span>
                      </label>
                      <select id="delegation-perm-new" v-model="newPermission" class="select select-bordered select-sm w-full">
                        <option value="VIEWER">{{ $t('settingsApp.agents.permissionViewer') }}</option>
                        <option value="USER">{{ $t('settingsApp.agents.permissionUser') }}</option>
                      </select>
                    </div>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div class="form-control w-full sm:w-48">
                      <label class="label py-0" for="delegation-mode-new">
                        <span class="label-text text-xs">{{ $t('settingsApp.agents.delegationMode') }}</span>
                      </label>
                      <select id="delegation-mode-new" v-model="newDelegationMode" class="select select-bordered select-sm w-full">
                        <option value="FULL">{{ $t('settingsApp.agents.modeFull') }}</option>
                        <option value="COLUMN_BOUND">{{ $t('settingsApp.agents.modeColumnBound') }}</option>
                      </select>
                    </div>

                    <div v-if="newDelegationMode === 'COLUMN_BOUND'" class="form-control flex-1 min-w-0">
                      <label class="label py-0" for="delegation-column-new">
                        <span class="label-text text-xs">{{ $t('settingsApp.agents.restrictedColumn') }}</span>
                      </label>
                      <div class="flex gap-2">
                        <select
                          id="delegation-column-new"
                          v-model="newRestrictedColumnId"
                          class="select select-bordered select-sm w-full"
                          :disabled="columnsQuery.isLoading.value"
                        >
                          <option value="">{{ $t('settingsApp.agents.selectColumn') }}</option>
                          <option v-for="c in availableColumns" :key="c.id" :value="c.id">
                            {{ c.name }}
                          </option>
                        </select>
                        <span v-if="columnsQuery.isLoading.value" class="loading loading-spinner loading-sm self-center" />
                      </div>
                    </div>

                    <div v-if="newDelegationMode === 'COLUMN_BOUND'" class="form-control w-full sm:w-32">
                      <label class="label py-0" for="delegation-move-range">
                        <span class="label-text text-xs">{{ $t('settingsApp.agents.moveRange') }}</span>
                      </label>
                      <select id="delegation-move-range" v-model="newAllowedMoveRange" class="select select-bordered select-sm w-full">
                        <option :value="0">{{ $t('settingsApp.agents.moveRangeNone') }}</option>
                        <option :value="1">±1</option>
                        <option :value="2">±2</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      class="btn btn-primary btn-sm shrink-0"
                      :disabled="!canSubmitDelegation || (newDelegationMode === 'COLUMN_BOUND' && newRestrictedColumnId === '')"
                      @click="onAddDelegation"
                    >
                      {{ $t('settingsApp.agents.addDelegation') }}
                    </button>
                  </div>

                  <p v-if="newDelegationMode === 'COLUMN_BOUND'" class="text-xs text-base-content/60">
                    {{ $t('settingsApp.agents.columnBoundHint') }}
                  </p>
                </div>
              </div>

              <ul v-if="sortedDelegations.length" class="divide-y divide-base-200 rounded-lg border border-base-300/50">
                <li
                  v-for="d in sortedDelegations"
                  :key="d.id"
                  class="py-3 px-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div class="min-w-0">
                    <p class="font-medium truncate">
                      {{ d.projectName || $t('settingsApp.agents.selectProject') }}
                      <span v-if="d.projectPrefix" class="text-xs font-mono text-base-content/50 ml-1">{{ d.projectPrefix }}</span>
                    </p>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <span v-if="d.isActive === false" class="badge badge-sm badge-ghost">{{ $t('settingsApp.agents.delegationRevokedBadge') }}</span>
                      <span v-if="d.delegationMode === 'COLUMN_BOUND'" class="badge badge-sm badge-info" :title="$t('settingsApp.agents.columnBoundHint')">
                        {{ $t('settingsApp.agents.modeColumnBound') }}
                      </span>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 items-center">
                    <select
                      v-model="delegationPermUi[d.id]"
                      class="select select-bordered select-xs w-full sm:w-36"
                      :disabled="d.isActive === false"
                      @change="onDelegationPermissionChange(d)"
                    >
                      <option value="VIEWER">{{ $t('settingsApp.agents.permissionViewer') }}</option>
                      <option value="USER">{{ $t('settingsApp.agents.permissionUser') }}</option>
                    </select>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-error"
                      :disabled="d.isActive === false"
                      @click="onRevokeDelegation(d)"
                    >
                      {{ $t('settingsApp.agents.delegationRevoke') }}
                    </button>
                  </div>
                </li>
              </ul>
              <p v-else class="text-sm text-base-content/70">{{ $t('settingsApp.agents.noDelegations') }}</p>
            </div>
          </div>
        </SettingsCard>
      </template>
    </DraggableSettingsGrid>
  </div>
</template>
