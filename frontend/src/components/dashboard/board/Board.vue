<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import ColumnHeader from '../columns/ColumnHeader.vue'
import TaskTile from '../tasks/TaskTile.vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { iColumn } from '@/types/columnTypes'
import type { iTask } from '@/types/taskTypes'
import type { Ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useColumnsStore } from '@/stores/columns'
import { useMembersStore } from '@/stores/members'
import { useTasksStore } from '@/stores/tasks'
import { useBacklogStore } from '@/stores/backlog'
import { useLayoutStore } from '@/stores/layout'
import { storeToRefs } from 'pinia'
import api from '@/api/v1/indexApi'
import { axiosApi } from '@/api/axios'
import { isValidId, validateId } from '@/utils/validation'
import { uiLog } from '@/utils/logger'
import { applyBoardTaskScope } from '@/utils/boardTaskScope'
import { useAgentAuth } from '@/composables/useAgentAuth'
import { useSearch } from '@/composables/useSearch'
import SearchInput from '@/components/search/SearchInput.vue'
import SearchResultsOverlay from '@/components/search/SearchResultsOverlay.vue'

const props = withDefaults(defineProps<{
  reviewDrawerOpen?: boolean
}>(), {
  reviewDrawerOpen: false,
})

const emit = defineEmits<{
  'update:reviewDrawerOpen': [value: boolean]
  'update:reviewCount': [value: number]
}>()

// Local, mutable copy for DnD
const localColumns: Ref<iColumn[]> = ref([])

const route = useRoute()
const projectId = computed(() => validateId(route.params.id) ?? 0)
const workspaceTaskId = computed(() => {
  const ws = route.query?.workspace
  return ws ? Number(ws) : null
})

const projectStore = useProjectStore()
const columnsStore = useColumnsStore()
const membersStore = useMembersStore()
const backlogStore = useBacklogStore()
const layoutStore = useLayoutStore()
const agentAuth = useAgentAuth()

// Search composable for this project
const search = useSearch({ projectId: projectId.value })

// Open task dialog from search results
function openTaskFromSearch(task: iTask) {
  layoutStore.openDialog({
    title: task.name,
    component: 'TaskDialog',
    item: task,
    hideHeader: true,
    size: '5xl',
  })
}

// Explicitly type tasksStore to preserve correct types for items
const tasksStore = useTasksStore()
const { items } = storeToRefs(tasksStore)

const rawResponse = ref('');
const isReviewDrawerOpen = computed({
  get: () => props.reviewDrawerOpen,
  set: (value: boolean) => emit('update:reviewDrawerOpen', value),
})

// Fetch board data from new API
const fetchBoardData = async () => {
  // Use axiosApi instead of native fetch to include Authorization header
  const response = await api.getProjectBoard(Number(projectId.value))
  rawResponse.value = JSON.stringify(response);
  return response
}

const {
  data: boardData,
  isLoading,
  isError,
  error,
  refetch
} = useQuery({
  queryKey: ['board', projectId],
  queryFn: fetchBoardData,
  enabled: isValidId(projectId.value),
  refetchOnMount: 'always',
})

function deepCloneColumns(columns: iColumn[]): iColumn[] {
  return (columns || []).map((col: iColumn) => ({
    ...col,
    tasks: Array.isArray(col.tasks) ? col.tasks.map((task: iTask) => ({ ...task })) : []
  }))
}

const reviewColumn = computed(() =>
  localColumns.value.find((col) => col.name.toLowerCase().includes('agent review')),
)

const visibleColumns = computed(() => {
  // Filter out agent review column for all users
  let columns = localColumns.value.filter((col) => !col.name.toLowerCase().includes('agent review'))
  
  // For column-bound agents, only show their restricted column
  if (agentAuth.isColumnBound.value) {
    const allowance = agentAuth.getProjectColumnAllowance(projectId.value)
    if (allowance?.restrictedColumnId != null) {
      columns = columns.filter((col) => col.id === allowance.restrictedColumnId)
    }
  }
  
  return columns
})

const reviewCount = computed(() => reviewColumn.value?.tasks?.length ?? 0)

watch(reviewCount, (count) => {
  emit('update:reviewCount', count)
}, { immediate: true })

// Sync board data to Pinia store
watch(boardData, (newData) => {
  if (newData) {
    projectStore.setProject({
      ...projectStore.project,
      ...newData,
    })
    const scopedColumns = applyBoardTaskScope(newData.columns || [], null, {
      includeNestedReviewOnMain: true,
    })
    localColumns.value = deepCloneColumns(scopedColumns)
    if (Array.isArray(scopedColumns)) {
      columnsStore.setItems([...scopedColumns])
      const allTasks = scopedColumns.flatMap((col: iColumn) => Array.isArray(col.tasks) ? col.tasks : [])
      items.value = allTasks
    }
    if (Array.isArray(newData.members)) {
      membersStore.setItems([...newData.members])
    }
    // Preload backlog store for this project
    if (projectId.value) {
      backlogStore.fetchBacklogTasks(projectId.value)
    }
  }
}, { immediate: true })

// Keep localColumns in sync with store columns
watch(
  () => projectStore.project.columns,
  (newColumns) => {
    const scopedColumns = applyBoardTaskScope((newColumns || []) as iColumn[], null, {
      includeNestedReviewOnMain: true,
    })
    localColumns.value = deepCloneColumns(scopedColumns)
  },
  { immediate: true }
)

async function onDnDEnd(evt: any) {
  const movedTaskId = Number(evt?.data?.id ?? evt?.clonedData?.id ?? evt?.item?.__draggable_context?.element?.id)
  if (!Number.isFinite(movedTaskId)) {
    // Could not identify moved item from drag event payload; fetch canonical state.
    refetch()
    return
  }

  const destination = localColumns.value
    .map((col) => {
      const taskIndex = (col.tasks ?? []).findIndex((task) => task.id === movedTaskId)
      return { columnId: col.id, taskIndex }
    })
    .find((entry) => entry.taskIndex !== -1)

  if (!destination) return

  // Find source column for permission check
  const sourceColumn = localColumns.value.find((col) =>
    (col.tasks ?? []).some((task) => task.id === movedTaskId)
  )
  const sourceColumnId = sourceColumn?.id

  // Check if column-bound agent can perform this move
  if (agentAuth.isColumnBound.value && sourceColumnId != null) {
    const allowance = agentAuth.getProjectColumnAllowance(projectId.value)
    if (allowance?.mode === 'COLUMN_BOUND') {
      const restrictedId = allowance.restrictedColumnId
      
      // Agent can only move tasks from their restricted column
      if (sourceColumnId !== restrictedId) {
        uiLog.warn('Column-bound agent attempted to move task from non-assigned column', {
          taskId: movedTaskId,
          sourceColumnId,
          restrictedColumnId: restrictedId,
        })
        refetch() // Reset to canonical state
        return
      }
      
      // Check if destination is allowed (±N columns)
      // For now we rely on the backend to enforce the exact range
      // but we can check if it's the restricted column or agent review
      const isReviewColumn = localColumns.value
        .find((col) => col.id === destination.columnId)
        ?.name.toLowerCase()
        .includes('review')
      
      if (destination.columnId !== restrictedId && !isReviewColumn) {
        // Check if within allowed range - simplified check
        const columnIds = localColumns.value
          .filter((col) => !col.name.toLowerCase().includes('review'))
          .map((col) => col.id)
        const restrictedIndex = columnIds.indexOf(restrictedId!)
        const destIndex = columnIds.indexOf(destination.columnId)
        const distance = Math.abs(destIndex - restrictedIndex)
        
        if (distance > (allowance.allowedMoveRange ?? 1)) {
          uiLog.warn('Column-bound agent attempted to move task beyond allowed range', {
            taskId: movedTaskId,
            distance,
            allowedRange: allowance.allowedMoveRange ?? 1,
          })
          refetch() // Reset to canonical state
          return
        }
      }
    }
  }

  // Keep local Pinia task list in sync immediately.
  const movedIndex = items.value.findIndex((t: iTask) => t.id === movedTaskId)
  if (movedIndex !== -1) {
    items.value[movedIndex] = {
      ...items.value[movedIndex],
      projectColumnId: destination.columnId,
      order: destination.taskIndex,
    }
  }

  // Persist as one move operation to reduce event volume.
  try {
    await axiosApi.post(`/tasks/${movedTaskId}/move`, {
      targetColumnId: destination.columnId,
      targetIndex: destination.taskIndex,
    })
  } catch (err) {
    uiLog.error('DnD Error moving task', { error: err })
    refetch()
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary to-80%">
    <template v-if="isLoading">
      <div class="flex flex-row flex-wrap justify-center gap-x-3 gap-y-8 mt-8 w-full max-w-full p-4">
        <!-- Skeleton columns -->
        <div v-for="n in 4" :key="n" class="w-80 shrink-0">
          <div class="skeleton h-8 w-full mb-4 rounded-lg"></div>
          <div class="space-y-3">
            <div v-for="m in 3" :key="m" class="skeleton h-24 w-full rounded-lg"></div>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="isError">
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span v-if="error?.message === 'JSON_PARSE_ERROR'">
            {{ $t('board.jsonParseError') }}
            <div class="mockup-code mt-2">
              <pre data-prefix="!" class="text-error whitespace-pre-wrap break-all">{{ rawResponse }}</pre>
            </div>
        </span>
        <span v-else>{{ error?.message || $t('board.failedToLoad') }}</span>
        </div>
      </div>
    </template>
    <template v-else-if="localColumns && localColumns.length">
      <!-- Sub-board breadcrumb -->
      <div v-if="workspaceTaskId" class="flex items-center gap-2 px-4 py-2 bg-base-200/50 text-sm">
        <button class="btn btn-ghost btn-xs" @click="$router.push({ name: 'Board', params: { id: $route.params.id } })">
          ← {{ projectStore.project?.name }}
        </button>
        <span class="text-base-content/40">/</span>
        <span class="font-medium">Sub-board</span>
      </div>
      
      <!-- Search bar -->
      <div class="px-4 py-2">
        <SearchInput
          v-model="search.searchQuery.value"
          :show-help="true"
          @search="search.search"
          @clear="search.clearSearch"
        />
      </div>

      <!-- Search results overlay -->
      <SearchResultsOverlay
        :is-open="search.isOverlayOpen.value"
        :tasks="search.results.value"
        :total="search.total.value"
        :page="search.currentPage.value"
        :limit="search.limit.value"
        :is-loading="search.isLoading.value"
        :project-name="projectStore.project?.name"
        @close="search.closeOverlay"
        @page-change="search.goToPage"
        @open-task="openTaskFromSearch"
      />

      <div class="flex flex-row flex-wrap justify-center gap-x-3 gap-y-8 mt-8 w-full max-w-full">
        <div
          v-for="(column, /* colIdx */) in visibleColumns"
          :key="column.id + '-' + (column.tasks ?? []).map(t => t.id).join(',')"
          class="flex flex-col items-center transition-[min-width,max-width] duration-200 ease-in-out"
          :style="{
            minWidth: `calc(220px * ${layoutStore.boardScale})`,
            maxWidth: `calc(220px * ${layoutStore.boardScale})`
          }"
        >
          <div class="text-base-content/80 font-bold mb-3 text-center select-none">
            <ColumnHeader :column="column" />
          </div>
          <VueDraggable
            v-model="column.tasks!"
            group="kanban-tasks"
            :animation="150"
            class="flex flex-col gap-4 w-full"
            @end="onDnDEnd"
          >
            <div
              v-for="(task, /* taskIdx */) in column.tasks ?? []"
              :key="task.id"
            >
                <TaskTile :id="task.id" :task="task" />
            </div>
            <div v-if="!(column.tasks ?? []).length" class="text-base-content/60 text-center py-4">
              <span>{{ $t('board.dropToAddCard') }}</span>
            </div>
          </VueDraggable>
        </div>
      </div>

      <div
        class="fixed top-[5.5rem] right-0 h-[calc(100%-5.5rem)] w-[360px] bg-base-100 border-l border-base-300 shadow-2xl z-30 transition-transform duration-200"
        :class="isReviewDrawerOpen ? 'translate-x-0' : 'translate-x-full'"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <h3 class="font-semibold">Agent Review</h3>
          <button class="btn btn-ghost btn-xs" @click="isReviewDrawerOpen = false">✕</button>
        </div>
        <div class="p-4 overflow-y-auto h-[calc(100%-56px)]">
          <VueDraggable
            v-if="reviewColumn"
            v-model="reviewColumn.tasks!"
            group="kanban-tasks"
            :animation="150"
            class="flex flex-col gap-3"
            @end="onDnDEnd"
          >
            <div v-for="task in reviewColumn.tasks ?? []" :key="task.id">
              <TaskTile :id="task.id" :task="task" />
            </div>
          </VueDraggable>
          <div v-if="!reviewCount" class="text-sm text-base-content/60">No items need review.</div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="flex flex-col items-center justify-center h-full py-8 text-base-content/60">
        <span>{{ $t('board.noColumnsFound') || 'No columns found for this board.' }}</span>
      </div>
    </template>
  </div>
</template>
