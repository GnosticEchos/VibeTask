<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import { useLayoutStore } from '@/stores/layout'
import { useMembersStore } from '@/stores/members'
import { useProjectStore } from '@/stores/project'
import { useProjectMutations } from '@/composables/useProjectMutations'
import api from '@/api/v1/indexApi'
import projectsApi from '@/api/v1/projectApi'
import { computed, reactive, ref, watch, watchEffect, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { iColumn, iUpdateColumn } from '@/types/columnTypes'
import { UpdateColumn } from '@/types/columnTypes'
import type { ColumnProtectionPolicy, ProjectSettings } from '@/types/documentTypes'
import { roles } from '@/const'
import { isValidId } from '@/utils/validation'
import WorkspaceMembersCard from '@/components/settings/workspace/WorkspaceMembersCard.vue'
import DraggableSettingsGrid from '@/components/settings/layout/DraggableSettingsGrid.vue'
import { useSettingsLayout } from '@/composables/useSettingsLayout'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { useAuthStore } from '@/stores/auth'
import { useProjectsQuery } from '@/composables/useProjectsQuery'
import type { iProject } from '@/types/projectTypes'
import { ClipboardDocumentListIcon } from '@heroicons/vue/24/outline'
import {
  buildCreateProjectPayload,
  getFallbackDrawerProjects,
  isDrawerUsingFallback,
  validateProjectPrefix,
} from '@/utils/workspaceProjectDrawer'
import {
  normalizeHexColor,
  resolveWorkspaceOutlineColor,
} from '@/utils/workspaceOutlineColor'
import { randomPastelColor } from '@/utils/functions'
import ProjectColumnsTableInput from '@/components/dashboard/project/settings/inputs/ProjectColumnsTableInput.vue'
import ProjectPlanningAcceptCard from '@/components/settings/project/ProjectPlanningAcceptCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { Form } from 'vee-validate'

const { workspaceMode, canInviteMembers, canDeleteProject } = useSettingsPermissions()
const membersStore = useMembersStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const settingsLayoutStore = useSettingsLayoutStore()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const { t } = useI18n()
const route = useRoute()
const { createProject, updateProject } = useProjectMutations()
watchEffect(() => {
  settingsLayoutStore.setUserId(String(authStore.user?.id || 'anonymous'))
})

const { layout, setLayout } = useSettingsLayout('project')

const WORKSPACE_PROJECT_DRAWER_ID = 'workspace-settings-project-drawer-toggle'

const projectsQuery = useProjectsQuery()
const projectDrawerOpen = ref(false)
const isCreateProjectFormOpen = ref(false)
const isCreatingProject = ref(false)
const newProjectName = ref('')
const newProjectPrefix = ref('')
const newProjectDescription = ref('')
const recentlyCreatedProjectId = ref<number | null>(null)

const sortedMemberProjects = computed((): iProject[] => {
  const list = projectsQuery.data.value
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
})
const drawerProjects = computed((): iProject[] => {
  return getFallbackDrawerProjects(
    sortedMemberProjects.value,
    projectStore.project,
    isValidId(projectStore.project.id),
  ) as iProject[]
})
const drawerUsingFallback = computed(
  () =>
    isDrawerUsingFallback(
      projectsQuery.isError.value,
      sortedMemberProjects.value.length,
      drawerProjects.value.length,
    ),
)
const newProjectPrefixValidation = computed(() => validateProjectPrefix(newProjectPrefix.value))
const canSubmitCreateProject = computed(
  () =>
    !isCreatingProject.value &&
    newProjectName.value.trim().length > 0 &&
    newProjectPrefixValidation.value.isValid,
)
const newProjectPrefixHint = computed(() => {
  const v = newProjectPrefixValidation.value
  if (v.reason === 'ok') return t('settingsHub.workspace.projectPrefixHint')
  if (v.reason === 'too_short') return t('settingsHub.workspace.projectPrefixTooShort')
  if (v.reason === 'too_long') return t('settingsHub.workspace.projectPrefixTooLong')
  return t('settingsHub.workspace.projectPrefixInvalidChars')
})

const projectId = computed(() => Number(projectStore.selectedProjectId || 0))
const hasProjectSelected = computed(() => isValidId(projectId.value))

const projectQuery = useQuery({
  queryKey: computed(() => ['project', projectId.value]),
  queryFn: () => projectsApi.getSingleProject(projectId.value),
  enabled: hasProjectSelected,
})

const columnsQuery = useQuery({
  queryKey: computed(() => ['columns', projectId.value]),
  queryFn: () => api.getItems<iColumn>('columns', { projectId: projectId.value }),
  enabled: hasProjectSelected,
})

const localName = ref('')
const localPrefix = ref('')
const localDescription = ref('')

const displayWorkspaceProjectName = computed(() => {
  if (!hasProjectSelected.value) return ''
  if (projectStore.project.id === projectId.value && projectStore.project.name?.trim()) {
    return projectStore.project.name
  }
  return localName.value?.trim() || ''
})
const inviteEmail = ref('')
const inviteRole = ref(roles[1] || 'Editor')
const isSavingProject = ref(false)
const isInvitingMember = ref(false)
const isSavingColumnsStructure = ref(false)
const isSavingPolicies = ref(false)

const columnsLocal = ref<iUpdateColumn[]>([])
const aggregatedColumnErrors = ref<Record<string, string | undefined>>({})
const columnExitRole = reactive<Record<number, string>>({})
const columnEnterRole = reactive<Record<number, string>>({})

const localWorkspaceOutlineColor = ref(resolveWorkspaceOutlineColor())
const baselineWorkspaceOutlineColor = ref(resolveWorkspaceOutlineColor())

const policyRoleOptions = ['', 'Editor', 'Maintainer', 'Owner'] as const

const isReadOnlyWorkspace = computed(() => workspaceMode.value !== 'editable')

const sortedColumns = computed((): iColumn[] => {
  const rows = columnsQuery.data.value
  if (!Array.isArray(rows)) return []
  return [...rows].sort((a, b) => a.order - b.order)
})

const columnsStructureDirty = computed(() => {
  const serverSnapshot = sortedColumns.value.map((col) => ({
    id: col.id,
    name: col.name,
    description: col.description ?? '',
    order: col.order,
    color: col.color,
    type: col.type ?? null,
  }))
  const localSnapshot = columnsLocal.value
    .filter((col) => !col.toDelete)
    .map((col) => ({
      id: col.id,
      name: col.name,
      description: col.description ?? '',
      order: col.order,
      color: col.color,
      type: col.type ?? null,
      isNew: col.isNew,
    }))
  if (localSnapshot.some((col) => col.isNew)) return true
  if (localSnapshot.length !== serverSnapshot.length) return true
  return JSON.stringify(serverSnapshot) !== JSON.stringify(localSnapshot.map(({ isNew: _n, ...rest }) => rest))
})

const columnsSectionValid = computed(
  () =>
    Object.values(aggregatedColumnErrors.value).filter((value) => value !== undefined && value !== '').length ===
    0,
)

const policyColumns = computed(() => columnsLocal.value.filter((col) => col.id != null && !col.toDelete))

const workspaceColorInvalid = computed(() => !normalizeHexColor(localWorkspaceOutlineColor.value))

const DEFAULT_COLUMN_COLOR = '#6366f1'

function ensureColumnHexColor(color: string | undefined): string {
  const trimmed = color?.trim()
  if (trimmed && /^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed
  return DEFAULT_COLUMN_COLOR
}

/** Assign 1..n order to visible columns so batch save and # column stay in sync. */
function renumberVisibleColumnOrders() {
  let next = 1
  for (const col of columnsLocal.value) {
    if (!col.toDelete) col.order = next++
  }
}

function syncColumnsLocalFromServer(rows: iColumn[]) {
  columnsLocal.value = [...rows]
    .sort((a, b) => a.order - b.order)
    .map(
      (col) =>
        new UpdateColumn({
          id: col.id,
          name: col.name ?? '',
          color: ensureColumnHexColor(col.color),
          order: col.order,
          type: col.type ?? null,
          description: col.description ?? '',
        }),
    )
  renumberVisibleColumnOrders()
}

function buildBulkColumnsPayload() {
  renumberVisibleColumnOrders()
  return columnsLocal.value.map((col) => {
    if (col.toDelete && col.id != null) {
      return { id: col.id, toDelete: true as const }
    }
    const trimmedName = col.name?.trim() || 'New Column'
    const base = {
      name: trimmedName,
      order: col.order,
      color: ensureColumnHexColor(col.color),
      type: col.type ?? null,
      description: col.description ?? '',
    }
    if (col.isNew) return base
    return { id: col.id as number, ...base }
  })
}

function onColumnsLocalUpdate(next: iUpdateColumn[]) {
  columnsLocal.value = next
  renumberVisibleColumnOrders()
}

function addNewColumn() {
  columnsLocal.value.push(
    new UpdateColumn({
      id: null,
      color: randomPastelColor(),
      order: columnsLocal.value.filter((c) => !c.toDelete).length + 1,
      name: '',
      type: null,
      description: '',
      isNew: true,
    }),
  )
  renumberVisibleColumnOrders()
}

watch(projectId, () => {
  columnsLocal.value = []
  for (const k of Object.keys(columnExitRole)) delete columnExitRole[Number(k)]
  for (const k of Object.keys(columnEnterRole)) delete columnEnterRole[Number(k)]
})

function applySettingsToPolicyDrafts(settings: ProjectSettings | undefined) {
  const protection = settings?.columnProtection ?? {}
  for (const col of policyColumns.value) {
    const id = col.id as number
    const policy = protection[String(id)] as ColumnProtectionPolicy | undefined
    columnExitRole[id] = policy?.exit ?? ''
    columnEnterRole[id] = policy?.enter ?? ''
  }
  const color = resolveWorkspaceOutlineColor(settings)
  localWorkspaceOutlineColor.value = color
  baselineWorkspaceOutlineColor.value = color
}

watch(
  () => columnsQuery.data.value,
  (rows) => {
    if (!hasProjectSelected.value || isSavingColumnsStructure.value) return
    if (!Array.isArray(rows)) return
    syncColumnsLocalFromServer(rows)
    if (projectQuery.data.value?.settings) {
      applySettingsToPolicyDrafts(projectQuery.data.value.settings as ProjectSettings)
    }
  },
  { immediate: true },
)

watch(
  () => projectQuery.data.value,
  (project) => {
    if (!project) return
    if (project.id === projectId.value) {
      projectStore.setProject(project)
    }
    localName.value = project.name || ''
    localPrefix.value = project.prefix || ''
    localDescription.value = project.description || ''
    applySettingsToPolicyDrafts(project.settings)
  },
  { immediate: true },
)

function selectWorkspaceProject(id: number) {
  if (!isValidId(id)) return
  projectStore.setSelectedProjectId(id)
  projectDrawerOpen.value = false
}

function retryProjectsLoad() {
  projectsQuery.refetch()
}

function openCreateProjectForm() {
  isCreateProjectFormOpen.value = true
}

function resetCreateProjectForm() {
  isCreateProjectFormOpen.value = false
  newProjectName.value = ''
  newProjectPrefix.value = ''
  newProjectDescription.value = ''
}

async function submitCreateProject() {
  if (!canSubmitCreateProject.value) return
  isCreatingProject.value = true
  try {
    const payload = buildCreateProjectPayload(
      newProjectName.value,
      newProjectPrefix.value,
      newProjectDescription.value,
    )
    if (!payload) {
      layoutStore.openToast({ message: t('settingsHub.workspace.createProjectInvalidForm'), type: 'error' })
      return
    }
    const created = await createProject({ ...payload, template: 'ADHOC_OPS' })
    const createdId = Number(created?.id ?? created?.project?.id ?? 0)
    if (isValidId(createdId)) {
      projectStore.setSelectedProjectId(createdId)
      recentlyCreatedProjectId.value = createdId
      setTimeout(() => {
        if (recentlyCreatedProjectId.value === createdId) recentlyCreatedProjectId.value = null
      }, 8000)
    }
    await projectsQuery.refetch()
    layoutStore.openToast({ message: t('settingsHub.workspace.createProjectSuccess'), type: 'success' })
    resetCreateProjectForm()
  } catch (_error) {
    layoutStore.openToast({ message: t('settingsHub.workspace.createProjectError'), type: 'error' })
  } finally {
    isCreatingProject.value = false
  }
}

async function saveWorkspace() {
  if (!hasProjectSelected.value || isReadOnlyWorkspace.value) return
  isSavingProject.value = true
  try {
    await updateProject({
      id: projectId.value,
      payload: {
        name: localName.value.trim(),
        prefix: localPrefix.value.trim(),
        description: localDescription.value.trim(),
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['project', projectId.value] })
    layoutStore.openToast({ message: 'Project settings saved.', type: 'success' })
  } catch (_error) {
    layoutStore.openToast({ message: 'Failed to save project settings.', type: 'error' })
  } finally {
    isSavingProject.value = false
  }
}

async function saveColumnsStructure() {
  if (!hasProjectSelected.value || isReadOnlyWorkspace.value) return
  const missingName = columnsLocal.value.some(
    (col) => !col.toDelete && !(col.name?.trim()),
  )
  if (missingName) {
    layoutStore.openToast({ message: t('settingsHub.workspace.columnNameRequired'), type: 'error' })
    return
  }
  isSavingColumnsStructure.value = true
  try {
    projectStore.setSelectedProjectId(projectId.value)
    await api.updateItems('columns', {
      projectId: projectId.value,
      columns: buildBulkColumnsPayload(),
    })
    await queryClient.invalidateQueries({ queryKey: ['columns', projectId.value] })
    await queryClient.invalidateQueries({ queryKey: ['project', projectId.value] })
    await queryClient.invalidateQueries({ queryKey: ['board', projectId.value] })
    const refreshed = await api.getItems<iColumn>('columns', { projectId: projectId.value })
    syncColumnsLocalFromServer(refreshed)
    applySettingsToPolicyDrafts(projectQuery.data.value?.settings as ProjectSettings | undefined)
    layoutStore.openToast({ message: t('settings.columns.saveSuccess'), type: 'success' })
  } catch (error: unknown) {
    const err = error as { message?: string; errors?: Record<string, string> }
    const detail =
      err.errors && Object.keys(err.errors).length > 0
        ? Object.values(err.errors).join(', ')
        : err.message
    layoutStore.openToast({
      message: detail || t('settings.columns.saveError'),
      type: 'error',
    })
  } finally {
    isSavingColumnsStructure.value = false
  }
}

async function saveColumnPolicies() {
  if (!hasProjectSelected.value || isReadOnlyWorkspace.value) return
  const outlineHex = normalizeHexColor(localWorkspaceOutlineColor.value)
  if (!outlineHex) {
    layoutStore.openToast({ message: t('settingsHub.workspace.workspaceColorInvalid'), type: 'error' })
    return
  }
  isSavingPolicies.value = true
  try {
    const existing = (projectQuery.data.value?.settings ?? {}) as ProjectSettings
    const columnProtection: Record<string, ColumnProtectionPolicy> = {}
    for (const col of policyColumns.value) {
      const id = col.id as number
      const exit = columnExitRole[id]
      const enter = columnEnterRole[id]
      if (exit || enter) {
        columnProtection[String(id)] = {
          ...(exit ? { exit: exit as ColumnProtectionPolicy['exit'] } : {}),
          ...(enter ? { enter: enter as ColumnProtectionPolicy['enter'] } : {}),
        }
      }
    }
    const settings = await projectsApi.patchProjectSettings(projectId.value, {
      ...existing,
      columnProtection,
      subBoardOutlineColor: outlineHex,
    })
    projectStore.setProject({ ...projectStore.project, settings })
    baselineWorkspaceOutlineColor.value = outlineHex
    localWorkspaceOutlineColor.value = outlineHex
    await queryClient.invalidateQueries({ queryKey: ['project', projectId.value] })
    await queryClient.invalidateQueries({ queryKey: ['board', projectId.value] })
    layoutStore.openToast({ message: t('settingsHub.workspace.workspaceSettingsSaveSuccess'), type: 'success' })
  } catch {
    layoutStore.openToast({ message: t('settingsHub.workspace.workspaceSettingsSaveError'), type: 'error' })
  } finally {
    isSavingPolicies.value = false
  }
}

function onWorkspaceColorPickerInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value) localWorkspaceOutlineColor.value = value
}

async function inviteMember() {
  if (!hasProjectSelected.value || !canInviteMembers.value || !inviteEmail.value.trim()) return
  isInvitingMember.value = true
  try {
    const foundMember = await membersStore.checkMemberEmail({
      email: inviteEmail.value.trim(),
      projectId: projectId.value,
    })

    await membersStore.inviteMembers({
      projectId: projectId.value,
      users: [{ id: foundMember.id, role: inviteRole.value }],
    })

    inviteEmail.value = ''
    await queryClient.invalidateQueries({ queryKey: ['members', projectId.value] })
    layoutStore.openToast({ message: 'Member invited successfully.', type: 'success' })
  } catch (_error) {
    layoutStore.openToast({ message: 'Member invitation failed.', type: 'error' })
  } finally {
    isInvitingMember.value = false
  }
}

function scrollToWorkspaceCard(cardId: string) {
  const id = `workspace-card-${cardId.replace(/\./g, '-')}`
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  const acceptRaw = route.query.acceptProject
  const acceptId = typeof acceptRaw === 'string' ? parseInt(acceptRaw, 10) : NaN
  if (isValidId(acceptId)) {
    selectWorkspaceProject(acceptId)
  }
})
</script>

<template>
  <div class="drawer drawer-end">
    <input
      :id="WORKSPACE_PROJECT_DRAWER_ID"
      v-model="projectDrawerOpen"
      type="checkbox"
      class="drawer-toggle"
    />
    <div class="drawer-content flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <h2 class="text-2xl font-semibold">{{ $t('settingsHub.workspace.title') }}</h2>
      <label
        :for="WORKSPACE_PROJECT_DRAWER_ID"
        class="btn btn-ghost btn-sm gap-1.5 border border-base-300/80 sm:btn-md sm:gap-2"
        :aria-label="$t('settingsHub.workspace.projectDrawerOpenAria')"
      >
        <ClipboardDocumentListIcon class="h-5 w-5 shrink-0 opacity-80" aria-hidden="true" />
        <span class="hidden sm:inline">{{ $t('settingsHub.workspace.projectDrawerButton') }}</span>
      </label>
      <div class="dropdown dropdown-end">
        <label
          tabindex="0"
          class="btn btn-ghost btn-circle btn-sm border border-base-300/80 sm:btn-md"
          :aria-label="$t('settingsHub.workspace.jumpNavAria')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </label>
        <ul tabindex="0" class="menu menu-sm dropdown-content z-[30] mt-2 w-56 rounded-box border border-base-300/60 bg-base-100 p-2 shadow-lg">
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.context')">
              {{ $t('settingsHub.workspace.jumpNavOverview') }}
            </button>
          </li>
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.general')">
              {{ $t('settingsHub.workspace.jumpNavGeneral') }}
            </button>
          </li>
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.invite')">
              {{ $t('settingsHub.workspace.jumpNavInvite') }}
            </button>
          </li>
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.members')">
              {{ $t('settingsHub.workspace.jumpNavMembers') }}
            </button>
          </li>
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.columns')">
              {{ $t('settingsHub.workspace.jumpNavColumns') }}
            </button>
          </li>
          <li>
            <button type="button" class="w-full text-left" @click="scrollToWorkspaceCard('project.danger')">
              {{ $t('settingsHub.workspace.jumpNavDanger') }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <p
      v-if="hasProjectSelected && displayWorkspaceProjectName"
      class="-mt-1 text-sm text-base-content/70"
    >
      {{ $t('settingsHub.workspace.activeProjectLabel') }}:
      <span class="font-medium text-base-content/90">{{ displayWorkspaceProjectName }}</span>
    </p>

    <ProjectPlanningAcceptCard
      v-if="hasProjectSelected"
      :project-id="projectId"
      class="mx-0"
    />

    <DraggableSettingsGrid
      :layout="layout"
      :editable="settingsLayoutStore.isEditMode"
      card-scroll-anchor-prefix="workspace"
      @layoutChange="setLayout"
    >
      <template #default="{ cardId }">
      <SettingsCard v-if="cardId === 'project.context'"
        :title="$t('settingsHub.workspace.title')"
        :subtitle="$t('settingsHub.workspace.generalSubtitle')"
        :mode="workspaceMode"
      >
        <div class="rounded-lg border border-base-300/80 bg-base-200/60 px-3 py-2 text-sm text-base-content/80">
          <span v-if="hasProjectSelected">{{ $t('settingsHub.workspace.projectName') }}: {{ localName || '—' }}</span>
          <span v-else>{{ $t('settingsHub.workspace.noProjectSelected') }}</span>
        </div>
      </SettingsCard>

      <div v-else-if="cardId === 'project.general'">
        <SettingsCard
          :title="$t('settingsHub.workspace.generalTitle')"
          :subtitle="$t('settingsHub.workspace.generalSubtitle')"
          :mode="workspaceMode"
        >
          <div v-if="!hasProjectSelected" class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80">
            {{ $t('settingsHub.workspace.noProjectSelected') }}
          </div>
          <div v-else-if="projectQuery.isLoading.value" class="flex justify-center py-6">
            <span class="loading loading-spinner loading-md" aria-label="Loading project settings" />
          </div>
          <div v-else-if="projectQuery.isError.value" class="alert alert-error">
            <span>{{ $t('settingsHub.workspace.loadError') }}</span>
          </div>
          <template v-else>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="form-control">
              <label class="label" for="workspace-name">{{ $t('settingsHub.workspace.projectName') }}</label>
              <input id="workspace-name" v-model="localName" class="input input-bordered w-full" :disabled="isReadOnlyWorkspace" />
            </div>
            <div class="form-control">
              <label class="label" for="workspace-prefix">{{ $t('settingsHub.workspace.projectPrefix') }}</label>
              <input id="workspace-prefix" v-model="localPrefix" class="input input-bordered w-full" :disabled="isReadOnlyWorkspace" />
            </div>
          </div>
          <div class="form-control">
            <label class="label" for="workspace-description">{{ $t('settingsHub.workspace.description') }}</label>
            <textarea
              id="workspace-description"
              v-model="localDescription"
              class="textarea textarea-bordered min-h-24 w-full"
              rows="3"
              :disabled="isReadOnlyWorkspace"
            />
          </div>
          </template>
          <template #actions>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="isReadOnlyWorkspace || !hasProjectSelected || isSavingProject"
              @click="saveWorkspace"
            >
              {{ $t('settingsApp.account.saveChanges') }}
            </button>
          </template>
        </SettingsCard>
      </div>

      <SettingsCard v-else-if="cardId === 'project.invite'"
        :title="$t('settingsHub.workspace.inviteTitle')"
        :subtitle="$t('settingsHub.workspace.inviteSubtitle')"
        :mode="canInviteMembers ? 'editable' : 'read-only'"
      >
        <div class="form-control">
          <label class="label" for="workspace-invite-email">{{ $t('settingsHub.workspace.memberEmail') }}</label>
          <input
            id="workspace-invite-email"
            v-model="inviteEmail"
            type="email"
            class="input input-bordered w-full"
            placeholder="teammate@example.com"
            :disabled="!canInviteMembers || !hasProjectSelected || isInvitingMember"
          />
        </div>
        <div class="form-control">
          <label class="label" for="workspace-role">{{ $t('settingsHub.workspace.memberRole') }}</label>
          <select id="workspace-role" v-model="inviteRole" class="select select-bordered w-full" :disabled="!canInviteMembers || !hasProjectSelected || isInvitingMember">
            <option v-for="role in roles" :key="role">{{ role }}</option>
          </select>
        </div>
        <template #actions>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!canInviteMembers || !hasProjectSelected || !inviteEmail.trim() || isInvitingMember"
            @click="inviteMember"
          >
            {{ $t('settingsHub.workspace.inviteAction') }}
          </button>
        </template>
      </SettingsCard>

      <WorkspaceMembersCard v-else-if="cardId === 'project.members'" :project-id="projectId" />

      <div v-else-if="cardId === 'project.columns'">
        <SettingsCard
          :title="$t('settingsHub.workspace.columnsTitle')"
          :subtitle="$t('settingsHub.workspace.columnsSubtitle')"
          :mode="workspaceMode"
        >
          <div v-if="!hasProjectSelected" class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80">
            {{ $t('settingsHub.workspace.noProjectSelected') }}
          </div>
          <div
            v-else-if="columnsQuery.isLoading && !columnsQuery.isFetched"
            class="flex justify-center py-6"
          >
            <span class="loading loading-spinner loading-md" aria-label="Loading columns" />
          </div>
          <div v-else-if="columnsQuery.isError.value" class="alert alert-error">
            <span>{{ $t('settingsHub.workspace.columnsLoadError') }}</span>
          </div>
          <template v-else>
          <div class="mb-4 rounded-lg border border-base-300/60 bg-base-100/50 p-3">
            <p class="text-sm font-medium text-base-content">{{ $t('settingsHub.workspace.workspaceColorTitle') }}</p>
            <p class="mt-1 text-xs text-base-content/60">{{ $t('settingsHub.workspace.workspaceColorHint') }}</p>
            <p class="mt-2 text-xs text-base-content/50">
              {{ $t('settingsHub.workspace.workspaceColorWhere') }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <input
                id="workspace-outline-color"
                type="color"
                class="h-10 w-14 cursor-pointer rounded border border-base-300 bg-base-100"
                :value="normalizeHexColor(localWorkspaceOutlineColor) || '#6366f1'"
                :disabled="isReadOnlyWorkspace"
                :aria-label="$t('settingsHub.workspace.workspaceColorPickerAria')"
                @input="onWorkspaceColorPickerInput"
              />
              <input
                id="workspace-outline-color-hex"
                v-model="localWorkspaceOutlineColor"
                type="text"
                class="input input-bordered input-sm w-32 font-mono"
                placeholder="#6366f1"
                maxlength="7"
                :disabled="isReadOnlyWorkspace"
                :class="{ 'input-error': workspaceColorInvalid && localWorkspaceOutlineColor.trim() !== '' }"
              />
              <span
                class="inline-flex h-8 w-8 shrink-0 rounded-full border border-base-300"
                :style="{ backgroundColor: normalizeHexColor(localWorkspaceOutlineColor) || 'var(--color-primary)' }"
                aria-hidden="true"
              />
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-2 text-sm font-medium text-base-content">{{ $t('settings.columns.title') }}</p>
            <p v-if="columnsLocal.filter((c) => !c.toDelete).length === 0" class="mb-3 text-sm text-base-content/70">
              {{ $t('settingsHub.workspace.noColumns') }}
            </p>
            <Form>
              <ProjectColumnsTableInput
                :columns="columnsLocal"
                :aggregated-errors="aggregatedColumnErrors"
                is-editing-columns
                @update:columns="onColumnsLocalUpdate"
                @update:aggregated-errors="aggregatedColumnErrors = $event"
              />
            </Form>
            <div class="mt-3 flex justify-end">
              <BaseButton
                :label="$t('settings.columns.addColumn')"
                icon="plus"
                :disabled="isReadOnlyWorkspace || isSavingColumnsStructure"
                @click="addNewColumn"
              />
            </div>
          </div>
          <div v-if="policyColumns.length > 0" class="space-y-2">
            <p class="text-sm font-medium text-base-content">{{ $t('settingsHub.workspace.movePoliciesTitle') }}</p>
            <div class="overflow-x-auto rounded-lg border border-base-300/60">
              <table class="table table-sm">
                <thead>
                  <tr class="bg-base-200/60">
                    <th>{{ $t('settings.columns.name') }}</th>
                    <th>{{ $t('settingsHub.workspace.movePolicyExit') }}</th>
                    <th>{{ $t('settingsHub.workspace.movePolicyEnter') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="col in policyColumns"
                    :key="col.id ?? `policy-order-${col.order}`"
                  >
                    <td class="font-medium whitespace-nowrap align-middle">
                      {{ col.name }}
                    </td>
                    <td class="align-middle">
                      <select
                        :id="`col-exit-${col.id}`"
                        v-model="columnExitRole[col.id as number]"
                        class="select select-bordered select-sm w-full min-w-[9rem]"
                        :disabled="isReadOnlyWorkspace"
                      >
                        <option v-for="opt in policyRoleOptions" :key="`exit-${col.id}-${opt}`" :value="opt">
                          {{ opt || $t('settingsHub.workspace.movePolicyNone') }}
                        </option>
                      </select>
                    </td>
                    <td class="align-middle">
                      <select
                        :id="`col-enter-${col.id}`"
                        v-model="columnEnterRole[col.id as number]"
                        class="select select-bordered select-sm w-full min-w-[9rem]"
                        :disabled="isReadOnlyWorkspace"
                      >
                        <option v-for="opt in policyRoleOptions" :key="`enter-${col.id}-${opt}`" :value="opt">
                          {{ opt || $t('settingsHub.workspace.movePolicyNone') }}
                        </option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </template>
          <p v-if="hasProjectSelected && !columnsQuery.isError.value && !(columnsQuery.isLoading && !columnsQuery.isFetched)" class="text-xs text-base-content/60 mt-2">
            Move policies apply when dragging tasks. Tasks marked <strong>Blocked by</strong> another task cannot be moved into a Done column until the blocker is Done.
          </p>
          <template #actions>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="
                isReadOnlyWorkspace ||
                !hasProjectSelected ||
                !columnsStructureDirty ||
                !columnsSectionValid ||
                isSavingColumnsStructure ||
                columnsQuery.isError.value
              "
              @click="saveColumnsStructure"
            >
              {{ isSavingColumnsStructure ? $t('settingsHub.workspace.columnsSaving') : $t('settings.columns.save') }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="isReadOnlyWorkspace || !hasProjectSelected || isSavingPolicies || workspaceColorInvalid"
              @click="saveColumnPolicies"
            >
              {{
                isSavingPolicies
                  ? $t('settingsHub.workspace.workspaceSettingsSaving')
                  : $t('settingsHub.workspace.workspaceSettingsSave')
              }}
            </button>
          </template>
        </SettingsCard>
      </div>

      <SettingsCard v-else-if="cardId === 'project.danger'"
        :title="$t('settingsHub.workspace.dangerTitle')"
        :subtitle="$t('settingsHub.workspace.dangerSubtitle')"
        :mode="canDeleteProject ? 'editable' : 'read-only'"
      >
        <p class="text-sm text-base-content/70">{{ $t('settingsHub.workspace.dangerBody') }}</p>
        <template #actions>
          <button type="button" class="btn btn-error btn-sm" :disabled="!canDeleteProject">
            {{ $t('settings.dangerZone.deleteProject') }}
          </button>
        </template>
      </SettingsCard>
      </template>
    </DraggableSettingsGrid>
    </div>

    <div class="drawer-side z-[80] border-l border-base-300/80 bg-base-100 shadow-xl">
      <label
        :for="WORKSPACE_PROJECT_DRAWER_ID"
        class="drawer-overlay bg-base-content/20"
        :aria-label="$t('settingsHub.workspace.projectDrawerCloseAria')"
      />
      <aside class="flex min-h-full w-[min(100vw,22rem)] max-w-[100vw] flex-col gap-3 bg-base-100 p-4">
        <div class="flex items-start justify-between gap-2 border-b border-base-300/60 pb-3">
          <div>
            <h3 class="text-lg font-semibold text-base-content">{{ $t('settingsHub.workspace.projectDrawerTitle') }}</h3>
            <p class="text-xs text-base-content/65">{{ $t('settingsHub.workspace.projectDrawerSubtitle') }}</p>
          </div>
          <label :for="WORKSPACE_PROJECT_DRAWER_ID" class="btn btn-ghost btn-circle btn-sm" :aria-label="$t('settingsHub.workspace.projectDrawerCloseAria')">
            ✕
          </label>
        </div>
        <div class="rounded-lg border border-base-300/70 bg-base-200/40 p-2">
          <button
            v-if="!isCreateProjectFormOpen"
            type="button"
            class="btn btn-sm btn-primary w-full"
            :disabled="isCreatingProject"
            @click="openCreateProjectForm"
          >
            {{ $t('project.createNewProject') }}
          </button>
          <form v-else class="flex flex-col gap-2" @submit.prevent="submitCreateProject">
            <input
              v-model="newProjectName"
              type="text"
              class="input input-bordered input-sm w-full"
              :placeholder="$t('settingsHub.workspace.projectName')"
              :disabled="isCreatingProject"
              required
            />
            <input
              v-model="newProjectPrefix"
              type="text"
              class="input input-bordered input-sm w-full"
              :placeholder="$t('settingsHub.workspace.projectPrefix')"
              :disabled="isCreatingProject"
              maxlength="8"
            />
            <p
              class="text-xs"
              :class="newProjectPrefixValidation.isValid ? 'text-base-content/60' : 'text-warning'"
            >
              {{ newProjectPrefixHint }}
            </p>
            <textarea
              v-model="newProjectDescription"
              class="textarea textarea-bordered textarea-sm w-full min-h-16"
              :placeholder="$t('settingsHub.workspace.description')"
              :disabled="isCreatingProject"
            />
            <div class="flex gap-2">
              <button
                type="button"
                class="btn btn-ghost btn-sm flex-1"
                :disabled="isCreatingProject"
                @click="resetCreateProjectForm"
              >
                {{ $t('settingsHub.workspace.cancelAction') }}
              </button>
              <button
                type="submit"
                class="btn btn-primary btn-sm flex-1"
                :disabled="!canSubmitCreateProject"
              >
                {{ isCreatingProject ? $t('settingsHub.workspace.creatingProject') : $t('project.createProject') }}
              </button>
            </div>
          </form>
        </div>
        <div
          v-if="projectsQuery.isLoading && !projectsQuery.isFetched"
          class="flex flex-1 justify-center py-10"
        >
          <span class="loading loading-spinner loading-lg" aria-label="Loading projects" />
        </div>
        <div v-else-if="projectsQuery.isError && drawerProjects.length === 0" class="space-y-2">
          <div class="alert alert-error text-sm">
            <span>{{ $t('settingsHub.workspace.projectsLoadError') }}</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline" @click="retryProjectsLoad">
            {{ $t('settingsHub.workspace.projectsRetry') }}
          </button>
        </div>
        <p v-else-if="drawerProjects.length === 0" class="text-sm text-base-content/70">
          {{ $t('settingsHub.workspace.noProjectsList') }}
        </p>
        <div v-else class="space-y-2">
          <div v-if="drawerUsingFallback" class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-content">
            {{ $t('settingsHub.workspace.projectsUsingFallback') }}
          </div>
          <ul class="menu menu-vertical rounded-box flex-1 gap-0.5 overflow-y-auto bg-base-200/40 p-2">
          <li v-for="p in drawerProjects" :key="p.id">
            <button
              type="button"
              class="flex w-full flex-col items-stretch gap-0.5 rounded-lg text-left sm:flex-row sm:items-center sm:justify-between"
              :class="p.id === projectId ? 'active' : ''"
              @click="selectWorkspaceProject(p.id)"
            >
              <span class="font-medium line-clamp-2">{{ p.name || '—' }}</span>
              <span
                v-if="p.lifecycleStatus === 'DRAFT' || p.status === 'DRAFT'"
                class="badge badge-warning badge-xs"
              >
                DRAFT
              </span>
              <span
                v-if="recentlyCreatedProjectId === p.id"
                class="badge badge-success badge-xs sm:badge-sm"
              >
                {{ $t('settingsHub.workspace.newProjectBadge') }}
              </span>
              <span v-if="p.role" class="text-xs opacity-70 sm:shrink-0">{{ p.role }}</span>
            </button>
          </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>
