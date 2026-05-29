<script setup lang="ts">
import projectApi from '@/api/v1/projectApi'
import { useLayoutStore } from '../stores/layout'
import { validateProjectId } from '../utils/validation'
import { onUnmounted, watch, computed, onMounted, ref, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useProjectQuery } from '@/composables/useProjectQuery'
import { useProjectStore } from '@/stores/project'
import { useWebsocketStore } from '@/stores/websocket'
import { useI18n } from 'vue-i18n'
import { uiLog } from '@/utils/logger'
import { resolveWorkspaceOutlineColor } from '@/utils/workspaceOutlineColor'
import { validateId } from '@/utils/validation'
import ProjectStatsBar from '@/components/dashboard/project/ProjectStatsBar.vue'
import type { ProjectDetailSummaryScope } from '@/composables/useProjectDetailSummaryQuery'
import type { Ref } from 'vue'

const projectStore = useProjectStore()
const websocketStore = useWebsocketStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

onMounted(() => {
  uiLog.debug('Mounted')
})

const projectId = computed(() => {
  try {
    return validateProjectId(route.params.id)
  } catch (error) {
    return null
  }
})

const isBoardRoute = computed(() => route.name === 'Board' || route.name === 'SubBoard')
const isMainBoard = computed(() => route.name === 'Board' && !route.query.workspace)

const activeWorkspaceId = computed(() => {
  if (route.name === 'SubBoard') {
    return validateId(route.params.parentId)
  }
  const fromQuery = route.query?.workspace
  if (fromQuery) {
    const id = Number(fromQuery)
    return Number.isFinite(id) ? id : null
  }
  return null
})

const projectSummaryScope = computed((): ProjectDetailSummaryScope => {
  const workspaceId = activeWorkspaceId.value
  if (workspaceId != null) {
    return { kind: 'workspace', workspaceId }
  }
  return { kind: 'main' }
})

const subBoardMenuRef = ref<HTMLDetailsElement | null>(null)
const isLoadingWorkspaces = ref(false)
const activeWorkspaces = ref<Array<{ id: number; name: string; identifier: string; subBoardOutlineColor: string | null; planAccepted: boolean }>>([])

const workspaceSummaryLabel = computed(() => {
  if (activeWorkspaceId.value == null) return null
  const match = activeWorkspaces.value.find((ws) => ws.id === activeWorkspaceId.value)
  if (match) return match.identifier
  if (route.name === 'SubBoard') {
    return String(route.params.parentId)
  }
  return null
})
const reviewDrawerOpen = ref(false)
const activeReviewCount = ref(0)

watch(
  () => projectId.value,
  (newId) => {
    projectStore.setSelectedProjectId(newId)
  },
  { immediate: true },
)

const {
  data: projectData,
  isError,
  error,
  isLoading,
} = useProjectQuery(projectId.value as number)

watch(isLoading, (loading) => {
  uiLog.debug('isLoading watcher triggered', { loading })
  projectStore.setLoading(loading)
})

watch(projectData, (newProject) => {
  uiLog.debug('projectData watcher triggered', { newProject })
  if (newProject) {
    projectStore.setProject(newProject)
  }
})

const channels = [
  'TasksIndexChannel',
  'ColumnsIndexChannel',
  'MembersIndexChannel',
  'ProjectIndexChannel',
]

function connectWSChannels(projectId: number) {
  channels.forEach((channel) => {
    websocketStore.joinChannel(channel, { projectId })
  })
}

function disconnectWSChannels() {
  channels.forEach((channel) => {
    websocketStore.leaveChannel(channel)
  })
}

const wsSubscribedProjectId = ref<number | null>(null)
watch(
  () => projectId.value,
  (newProjectId, oldProjectId) => {
    if (newProjectId === oldProjectId) return

    if (wsSubscribedProjectId.value !== null) {
      disconnectWSChannels()
      wsSubscribedProjectId.value = null
    }

    if (typeof newProjectId === 'number') {
      connectWSChannels(newProjectId)
      wsSubscribedProjectId.value = newProjectId
    }
  },
  { immediate: true },
)

watch(isError, (hasError) => {
  uiLog.error('isError watcher triggered', { hasError, error: error.value })
  if (hasError) {
    disconnectWSChannels()
    layoutStore.openToast({ message: 'Project view error. Redirecting to explore.', type: 'error' })
    router.push('/dashboard/explore')
  }
})

const TAB_COUNT = 5

const boardTabRef: Ref<InstanceType<typeof RouterLink> | null> = ref(null)
const gridTabRef: Ref<InstanceType<typeof RouterLink> | null> = ref(null)
const membersTabRef = ref<HTMLButtonElement | null>(null)
const docsTabRef: Ref<InstanceType<typeof RouterLink> | null> = ref(null)
const addTaskTabRef = ref<HTMLButtonElement | null>(null)

function focusTabEl(el: unknown) {
  const node = el && typeof el === 'object' && '$el' in el ? (el as { $el: HTMLElement }).$el : (el as HTMLElement)
  if (node && typeof node.focus === 'function') {
    node.focus()
  }
}

function focusTab(idx: number) {
  nextTick(() => {
    const refs = [boardTabRef.value, gridTabRef.value, membersTabRef.value, docsTabRef.value, addTaskTabRef.value]
    focusTabEl(refs[idx])
  })
}

function onTabKeydown(e: Event, idx: number) {
  if (!(e instanceof KeyboardEvent)) return
  if (e.key === 'ArrowRight') {
    focusTab((idx + 1) % TAB_COUNT)
    e.preventDefault()
  } else if (e.key === 'ArrowLeft') {
    focusTab((idx - 1 + TAB_COUNT) % TAB_COUNT)
    e.preventDefault()
  } else if (e.key === 'Home') {
    focusTab(0)
    e.preventDefault()
  } else if (e.key === 'End') {
    focusTab(TAB_COUNT - 1)
    e.preventDefault()
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (idx === 0) {
      router.push({ name: 'Board', params: { id: route.params.id } })
    } else if (idx === 1) {
      router.push({ name: 'ProjectGrid', params: { id: route.params.id } })
    } else if (idx === 2) {
      openMembersDialog()
    } else if (idx === 3) {
      openAddTaskDialog()
    }
    e.preventDefault()
  }
}

function openMembersDialog() {
  layoutStore.openDialog({
    component: 'WorkspaceMembersCardDialog',
    size: 'min(44rem, 94vw)',
    hideHeader: true,
  })
}

function openAddTaskDialog() {
  layoutStore.openDialog({
    title: t('project.addNewTask'),
    component: 'AddNewTaskDialog',
    size: '2xl',
  })
}

function openNewWorkspaceDialog() {
  layoutStore.openDialog({
    title: t('project.newWorkspace'),
    component: 'AddNewTaskDialog',
    item: { createWorkspace: true, openWorkspaceAfter: true },
    size: '2xl',
  })
}

async function loadSubBoards() {
  if (!projectId.value) return
  const boardDerived = getSubBoardsFromProject(projectStore.project as any)
  activeWorkspaces.value = boardDerived

  isLoadingWorkspaces.value = true
  try {
    const response = await projectApi.getActiveWorkspaces(projectId.value)
    const apiWorkspaces = Array.isArray(response)
      ? response
      : Array.isArray((response as any)?.data)
        ? (response as any).data
        : []
    activeWorkspaces.value = mergeSubBoards(boardDerived, apiWorkspaces)
  } catch (error) {
    uiLog.error('Failed to fetch sub-boards', { error })
    activeWorkspaces.value = boardDerived
  } finally {
    isLoadingWorkspaces.value = false
  }
}

function onSubBoardMenuToggle(event: Event) {
  const details = event.target as HTMLDetailsElement
  if (!details.open) return
  void loadSubBoards()
}

function getSubBoardsFromProject(projectLike: any) {
  const columns = Array.isArray(projectLike?.columns) ? projectLike.columns : []
  const tasks = columns.flatMap((column: any) => (Array.isArray(column?.tasks) ? column.tasks : []))
  return tasks
    .filter((task: any) => {
      const childCount = Number(task?.childCount ?? task?.children?.length ?? 0)
      return Boolean(task?.isContainer) && childCount > 0
    })
    .map((task: any) => ({
      id: Number(task.id),
      name: String(task.name ?? ''),
      identifier: String(task.identifier ?? `TASK-${task.id}`),
      subBoardOutlineColor: task.subBoardOutlineColor ?? resolveWorkspaceOutlineColor(projectStore.project?.settings),
      planAccepted: Boolean(task.planAccepted),
    }))
}

function mergeSubBoards(
  primary: Array<{ id: number; name: string; identifier: string; subBoardOutlineColor: string | null; planAccepted: boolean }>,
  secondary: Array<{ id: number; name: string; identifier: string; subBoardOutlineColor: string | null; planAccepted: boolean }>,
) {
  const merged = new Map<number, { id: number; name: string; identifier: string; subBoardOutlineColor: string | null; planAccepted: boolean }>()
  for (const workspace of [...primary, ...secondary]) {
    merged.set(Number(workspace.id), {
      id: Number(workspace.id),
      name: String(workspace.name ?? ''),
      identifier: String(workspace.identifier ?? `TASK-${workspace.id}`),
      subBoardOutlineColor:
        workspace.subBoardOutlineColor ?? resolveWorkspaceOutlineColor(projectStore.project?.settings),
      planAccepted: Boolean(workspace.planAccepted),
    })
  }
  return [...merged.values()]
}

watch(
  () => route.fullPath,
  () => {
    if (subBoardMenuRef.value) subBoardMenuRef.value.open = false
    reviewDrawerOpen.value = false
    activeReviewCount.value = 0
  },
)

function selectSubBoard(workspaceId: number) {
  if (!projectId.value) return
  router.push({ name: 'SubBoard', params: { id: projectId.value, parentId: workspaceId } })
  if (subBoardMenuRef.value) subBoardMenuRef.value.open = false
}

function backToMainBoard() {
  if (!projectId.value) return
  router.push({ name: 'Board', params: { id: projectId.value } })
  if (subBoardMenuRef.value) subBoardMenuRef.value.open = false
}

onUnmounted(() => {
  uiLog.debug('Unmounted')
  disconnectWSChannels()
  wsSubscribedProjectId.value = null
  projectStore.clearSelectedProject()
})
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 w-full">
    <div class="flex items-center flex-none border-b border-base-300 min-h-8">
      <div role="tablist" class="tabs tabs-border flex-none">
        <router-link
          ref="boardTabRef"
          :to="{ name: 'Board', params: { id: $route.params.id } }"
          role="tab"
          class="tab"
          :class="{ 'tab-active': $route.name === 'Board' }"
          :tabindex="$route.name === 'Board' ? 0 : -1"
          :aria-selected="$route.name === 'Board' ? 'true' : 'false'"
          aria-controls="tabpanel-board"
          @keydown="(e: Event) => onTabKeydown(e, 0)"
        >
          {{ projectStore.project?.name || $t('views.board') }}
        </router-link>
        <router-link
          ref="gridTabRef"
          :to="{ name: 'ProjectGrid', params: { id: $route.params.id } }"
          role="tab"
          class="tab"
          :class="{ 'tab-active': $route.name === 'ProjectGrid' }"
          :tabindex="$route.name === 'ProjectGrid' ? 0 : -1"
          :aria-selected="$route.name === 'ProjectGrid' ? 'true' : 'false'"
          aria-controls="tabpanel-grid"
          @keydown="(e: Event) => onTabKeydown(e, 1)"
        >
          Grid
        </router-link>
        <button
          ref="membersTabRef"
          type="button"
          role="tab"
          class="tab"
          tabindex="-1"
          aria-selected="false"
          aria-controls="tabpanel-members-overlay"
          @click="openMembersDialog"
          @keydown="(e: Event) => onTabKeydown(e, 2)"
        >
          {{ $t('members.title') }}
        </button>
        <router-link
          ref="docsTabRef"
          :to="{ name: 'ProjectDocs', params: { id: $route.params.id } }"
          role="tab"
          class="tab"
          :class="{ 'tab-active': $route.name === 'ProjectDocs' }"
          :tabindex="$route.name === 'ProjectDocs' ? 0 : -1"
          :aria-selected="$route.name === 'ProjectDocs' ? 'true' : 'false'"
          aria-controls="tabpanel-docs"
          @keydown="(e: Event) => onTabKeydown(e, 3)"
        >
          Docs
        </router-link>
        <button
          v-if="isBoardRoute"
          ref="newWorkspaceTabRef"
          type="button"
          role="tab"
          class="tab"
          tabindex="-1"
          aria-selected="false"
          @click="openNewWorkspaceDialog"
        >
          {{ $t('project.newWorkspace') }}
        </button>
        <button
          ref="addTaskTabRef"
          type="button"
          role="tab"
          class="tab"
          tabindex="-1"
          aria-selected="false"
          aria-controls="tabpanel-add-task"
          @click="openAddTaskDialog"
          @keydown="(e: Event) => onTabKeydown(e, 4)"
        >
          {{ $t('project.addNewTask') }}
        </button>
      </div>

      <div v-if="isBoardRoute" class="flex items-center gap-3 ml-3 whitespace-nowrap">
        <details ref="subBoardMenuRef" class="dropdown" @toggle="onSubBoardMenuToggle">
          <summary class="btn btn-ghost btn-xs gap-1">
            <span>{{ $t('project.workspaceMenu') }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </summary>
          <ul tabindex="0" class="dropdown-content z-10 menu list-none bg-base-100 rounded-box p-2 shadow-lg w-fit min-w-[24rem] max-w-[min(92vw,48rem)]">
            <li v-if="!isMainBoard">
              <button type="button" @click="backToMainBoard">Main board</button>
            </li>
            <li class="menu-title"><span class="text-left">{{ $t('project.activeWorkspaces') }}</span></li>
            <li v-if="isLoadingWorkspaces">
              <span class="text-base-content/50 text-xs">Loading...</span>
            </li>
            <li v-else-if="activeWorkspaces.length === 0">
              <span class="text-base-content/50 text-xs">No active sub-boards</span>
            </li>
            <li v-for="workspace in activeWorkspaces" :key="workspace.id">
              <button type="button" class="w-full justify-start text-left normal-case whitespace-nowrap" @click="selectSubBoard(workspace.id)">
                <span class="w-2 h-2 rounded-full inline-block mr-1" :style="{ backgroundColor: workspace.subBoardOutlineColor || 'var(--color-primary)' }"></span>
                <span v-if="!workspace.planAccepted" class="badge badge-xs badge-info mr-1">DRAFT</span>
                {{ workspace.identifier }}: {{ workspace.name }}
              </button>
            </li>
          </ul>
        </details>
        <span class="text-xs text-base-content/60">Card size</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          :value="layoutStore.boardScale"
          class="range range-xs range-primary w-24"
          aria-label="Card size"
          @input="layoutStore.setBoardScale(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-xs font-medium text-primary min-w-[3ch]">{{ Math.round(layoutStore.boardScale * 100) }}%</span>
      </div>

      <button
        v-if="isBoardRoute"
        type="button"
        class="btn btn-xs ml-auto mr-3"
        :class="activeReviewCount > 0 ? 'btn-error' : 'btn-ghost'"
        @click="reviewDrawerOpen = !reviewDrawerOpen"
      >
        Review Inbox
        <span class="badge badge-xs">{{ activeReviewCount }}</span>
      </button>
    </div>

    <ProjectStatsBar
      v-if="projectId"
      :project-id="projectId"
      :scope="projectSummaryScope"
      :workspace-label="workspaceSummaryLabel"
      @open-members="openMembersDialog"
    />

    <router-view v-slot="{ Component }">
      <component
        :is="Component"
        class="flex-1 min-h-0 w-full min-w-0"
        v-model:review-drawer-open="reviewDrawerOpen"
        @update:review-count="activeReviewCount = $event"
      />
    </router-view>
  </div>
</template>
