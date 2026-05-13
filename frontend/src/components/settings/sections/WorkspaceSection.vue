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
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import type { iColumn } from '@/types/columnTypes'
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

const { workspaceMode, canInviteMembers, canDeleteProject } = useSettingsPermissions()
const membersStore = useMembersStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const settingsLayoutStore = useSettingsLayoutStore()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const { t } = useI18n()
const { createProject, updateProject, updateColumnDescription } = useProjectMutations()

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
const isSavingColumns = ref(false)

const columnDrafts = reactive<Record<number, string>>({})
const lastServerDescriptions = reactive<Record<number, string>>({})

const isReadOnlyWorkspace = computed(() => workspaceMode.value !== 'editable')

const sortedColumns = computed((): iColumn[] => {
  const rows = columnsQuery.data.value
  if (!Array.isArray(rows)) return []
  return [...rows].sort((a, b) => a.order - b.order)
})

const columnsDirty = computed(() =>
  sortedColumns.value.some((col) => (columnDrafts[col.id] ?? '') !== (col.description ?? '')),
)

function autosizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function resizeTextarea(event: Event) {
  autosizeTextarea(event.target as HTMLTextAreaElement)
}

const vAutosizeTextarea = {
  mounted: autosizeTextarea,
  updated: autosizeTextarea,
}

watch(projectId, () => {
  for (const k of Object.keys(columnDrafts)) delete columnDrafts[Number(k)]
  for (const k of Object.keys(lastServerDescriptions)) delete lastServerDescriptions[Number(k)]
})

watch(
  () => columnsQuery.data.value,
  (rows) => {
    if (!hasProjectSelected.value) return
    if (!Array.isArray(rows)) return
    const ids = new Set(rows.map((c) => c.id))
    for (const key of Object.keys(columnDrafts)) {
      const id = Number(key)
      if (!ids.has(id)) {
        delete columnDrafts[id]
        delete lastServerDescriptions[id]
      }
    }
    for (const col of rows) {
      const id = col.id
      const srv = col.description ?? ''
      const prevSrv = lastServerDescriptions[id]
      if (prevSrv === undefined || columnDrafts[id] === prevSrv) {
        columnDrafts[id] = srv
      }
      lastServerDescriptions[id] = srv
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
    const created = await createProject(payload)
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

async function saveColumnDescriptions() {
  if (!hasProjectSelected.value || isReadOnlyWorkspace.value) return
  const pid = projectId.value
  const toSave = sortedColumns.value.filter(
    (col) => (columnDrafts[col.id] ?? '') !== (col.description ?? ''),
  )
  if (toSave.length === 0) return
  isSavingColumns.value = true
  try {
    await Promise.all(
      toSave.map((col) =>
        updateColumnDescription({
          projectId: pid,
          columnId: col.id,
          description: (columnDrafts[col.id] ?? '').trim(),
        }),
      ),
    )
    layoutStore.openToast({ message: t('settingsHub.workspace.columnsSaveSuccess'), type: 'success' })
  } catch (_error) {
    layoutStore.openToast({ message: t('settingsHub.workspace.columnsSaveError'), type: 'error' })
  } finally {
    isSavingColumns.value = false
  }
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
              v-autosize-textarea
              v-model="localDescription"
              class="textarea textarea-bordered min-h-24 w-full resize-none overflow-hidden"
              :disabled="isReadOnlyWorkspace"
              @input="resizeTextarea"
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
          <div v-else-if="sortedColumns.length === 0" class="text-sm text-base-content/70">
            {{ $t('settingsHub.workspace.noColumns') }}
          </div>
          <div
            v-else
            class="flex flex-col gap-3"
          >
            <div
              v-for="col in sortedColumns"
              :key="col.id"
              class="shrink-0 rounded-lg border border-base-300/60 bg-base-100/40 p-3"
            >
              <div class="mb-2 text-sm font-medium text-base-content">{{ col.name }}</div>
              <div class="form-control">
                <label class="label py-1" :for="`column-desc-${col.id}`">
                  <span class="label-text text-xs text-base-content/70">{{ $t('settingsHub.workspace.columnDescriptionLabel') }}</span>
                </label>
                <textarea
                  :id="`column-desc-${col.id}`"
                  v-autosize-textarea
                  v-model="columnDrafts[col.id]"
                  class="textarea textarea-bordered min-h-16 w-full resize-none overflow-hidden text-sm"
                  :disabled="isReadOnlyWorkspace"
                  @input="resizeTextarea"
                />
              </div>
            </div>
          </div>
          <template #actions>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="isReadOnlyWorkspace || !hasProjectSelected || !columnsDirty || isSavingColumns || columnsQuery.isError.value"
              @click="saveColumnDescriptions"
            >
              {{ $t('settingsApp.account.saveChanges') }}
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
