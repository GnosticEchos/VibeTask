<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import ColumnHeader from '@/components/dashboard/columns/ColumnHeader.vue'
import TaskTile from '@/components/dashboard/tasks/TaskTile.vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { iColumn } from '@/types/columnTypes'
import type { iTask } from '@/types/taskTypes'
import { useProjectStore } from '@/stores/project'
import { useColumnsStore } from '@/stores/columns'
import { useTasksStore } from '@/stores/tasks'
import { useMembersStore } from '@/stores/members'
import { useLayoutStore } from '@/stores/layout'
import { storeToRefs } from 'pinia'
import api from '@/api/v1/indexApi'
import { validateId } from '@/utils/validation'
import { uiLog } from '@/utils/logger'
import type { Ref } from 'vue'
import { applyBoardTaskScope, mergeWorkspaceChildrenIntoBoard } from '@/utils/boardTaskScope'
import { resolveTaskWorkspaceOutlineColor } from '@/utils/workspaceOutlineColor'

const props = withDefaults(defineProps<{
  reviewDrawerOpen?: boolean
}>(), {
  reviewDrawerOpen: false,
})

const emit = defineEmits<{
  'update:reviewDrawerOpen': [value: boolean]
  'update:reviewCount': [value: number]
}>()

const route = useRoute()
const router = useRouter()

const projectId = computed(() => validateId(route.params.id) ?? 0)
const parentId = computed(() => validateId(route.params.parentId) ?? 0)

const projectStore = useProjectStore()
const columnsStore = useColumnsStore()
const tasksStore = useTasksStore()
const membersStore = useMembersStore()
const layoutStore = useLayoutStore()
const { items } = storeToRefs(tasksStore)

// Local, mutable copy for DnD
const localColumns: Ref<iColumn[]> = ref([])

// Fetch sub-board data (filtered columns + child tasks)
const fetchSubBoardData = async () => {
  uiLog.debug('SubBoardView: Fetching sub-board data', { projectId: projectId.value, parentId: parentId.value })
  const response = await api.getProjectBoard(Number(projectId.value), {
    view: 'subboard',
    parentId: parentId.value,
  })
  return response
}

// Watch enabled state for debugging
const isEnabled = computed(() => !!projectId.value && !!parentId.value)
watch(isEnabled, (enabled) => {
  uiLog.debug('SubBoardView: Query enabled state changed', { enabled, projectId: projectId.value, parentId: parentId.value })
}, { immediate: true })

const {
  data: boardData,
  isLoading,
  isError,
  error,
  refetch,
} = useQuery({
  queryKey: ['subboard', projectId, parentId],
  queryFn: fetchSubBoardData,
  enabled: isEnabled,
})

// Get parent task for header
const { data: parentTask } = useQuery({
  queryKey: ['task', parentId],
  queryFn: () => api.getItem('tasks', parentId.value, {}),
  enabled: computed(() => !!parentId.value),
})

function deepCloneColumns(columns: iColumn[]): iColumn[] {
  return (columns || []).map((col: iColumn) => ({
    ...col,
    tasks: Array.isArray(col.tasks) ? col.tasks.map((task: iTask) => ({ ...task })) : [],
  }))
}

const isReviewDrawerOpen = computed({
  get: () => props.reviewDrawerOpen,
  set: (value: boolean) => emit('update:reviewDrawerOpen', value),
})

const reviewColumn = computed(() =>
  localColumns.value.find((col: iColumn) => col.name.toLowerCase().includes('agent review')),
)

const visibleColumns = computed(() => {
  if (!localColumns.value) return []
  // For sub-boards, show all standard columns (not just Execute+)
  // Child tasks can be in any phase: Discovery, Specify, Plan, Execute, Finalized
  return localColumns.value.filter((col: iColumn) => !col.name.toLowerCase().includes('agent review'))
})

const reviewCount = computed(() => reviewColumn.value?.tasks?.length ?? 0)

watch(reviewCount, (count) => {
  emit('update:reviewCount', count)
}, { immediate: true })

function syncSubBoardColumnsFromApi(boardPayload: { columns?: iColumn[]; members?: unknown } | undefined) {
  if (!boardPayload) return
  const scopedColumns = applyBoardTaskScope(boardPayload.columns || [], parentId.value, {
    includeNestedReviewOnMain: false,
  })
  const children = (parentTask.value as { children?: Parameters<typeof mergeWorkspaceChildrenIntoBoard>[2] } | undefined)
    ?.children
  const withOrphans = mergeWorkspaceChildrenIntoBoard(
    scopedColumns,
    parentId.value,
    children ?? [],
  )
  localColumns.value = deepCloneColumns(withOrphans)
  if (Array.isArray(withOrphans)) {
    columnsStore.setItems([...withOrphans])
    const allTasks = withOrphans.flatMap((col: iColumn) =>
      Array.isArray(col.tasks) ? col.tasks : [],
    )
    items.value = allTasks
  }
  if (Array.isArray(boardPayload.members)) {
    membersStore.setItems([...boardPayload.members])
  }
}

// Sync board data to Pinia store (re-run when parent children list changes)
watch([boardData, parentTask], ([newData]) => {
  uiLog.debug('SubBoardView: boardData changed', { newData, hasColumns: !!newData?.columns, columnsLength: newData?.columns?.length, hasMembers: !!newData?.members })
  if (newData) {
    syncSubBoardColumnsFromApi(newData)
  }
}, { immediate: true })

const completedCount = computed(() => {
  const finalizedCol = visibleColumns.value.find((col: iColumn) =>
    col.name.toLowerCase().includes('finalized'),
  )
  return finalizedCol?.tasks?.length || 0
})

const totalCount = computed(() => {
  return visibleColumns.value.reduce((acc: number, col: iColumn) => acc + (col.tasks?.length || 0), 0)
})

const headerStyle = computed(() => ({
  borderColor:
    resolveTaskWorkspaceOutlineColor(
      (parentTask.value ?? {}) as { subBoardOutlineColor?: string | null; isContainer?: boolean; planAccepted?: boolean },
      projectStore.project?.settings,
    ) ?? '#6366f1',
}))

function goBackToMainBoard() {
  router.push({ name: 'Board', params: { id: route.params.id } })
}

async function onDnDEnd(evt: any) {
  const movedTaskId = Number(evt?.data?.id ?? evt?.clonedData?.id ?? evt?.item?.__draggable_context?.element?.id)
  if (!Number.isFinite(movedTaskId)) {
    refetch()
    return
  }

  const destination = localColumns.value
    .map((col: iColumn) => {
      const taskIndex = (col.tasks ?? []).findIndex((task: iTask) => task.id === movedTaskId)
      return { columnId: col.id, taskIndex }
    })
    .find((entry: { columnId: number; taskIndex: number }) => entry.taskIndex !== -1)

  if (!destination) return

  const movedIndex = items.value.findIndex((t: iTask) => t.id === movedTaskId)
  if (movedIndex !== -1) {
    items.value[movedIndex] = {
      ...items.value[movedIndex],
      projectColumnId: destination.columnId,
      order: destination.taskIndex,
    }
  }

  try {
    await api.updateItem('tasks', movedTaskId, {
      projectId: projectId.value,
      projectColumnId: destination.columnId,
    })
  } catch (err) {
    uiLog.error('DnD Error moving task', { error: err })
    refetch()
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-gradient-to-br from-secondary to-accent to-80%">
    <!-- Breadcrumb Navigation -->
    <div class="flex items-center gap-2 px-4 py-3 bg-base-200/50 text-sm">
      <button
        class="btn btn-ghost btn-xs"
        @click="goBackToMainBoard"
      >
        ← {{ (projectStore.project as any)?.name || 'Main Board' }}
      </button>
      <span class="text-base-content/40">/</span>
      <span class="font-medium">{{ (parentTask as any)?.identifier || 'Sub-board' }}</span>
    </div>

    <!-- Sub-board Header -->
    <div
      v-if="parentTask"
      class="px-6 py-4 mx-4 mt-4 rounded-lg border-l-4"
      :style="headerStyle"
    >
      <h1 class="text-2xl font-bold">
        {{ (parentTask as any).identifier }}: {{ (parentTask as any).name }}
      </h1>
      <div class="flex gap-4 mt-2 text-sm text-base-content/70">
        <span class="badge badge-success">Plan Accepted ✓</span>
        <span>{{ completedCount }} of {{ totalCount }} complete</span>
      </div>
      <p class="mt-2 text-base-content/80">{{ (parentTask as any).description }}</p>
    </div>

    <!-- Loading state -->
    <template v-if="isLoading">
      <div class="flex flex-row flex-wrap justify-center gap-x-3 gap-y-8 mt-8 w-full max-w-full p-4">
        <div v-for="n in 3" :key="n" class="w-80 shrink-0">
          <div class="skeleton h-8 w-full mb-4 rounded-lg"></div>
          <div class="space-y-3">
            <div v-for="m in 2" :key="m" class="skeleton h-24 w-full rounded-lg"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Error state -->
    <template v-else-if="isError">
      <div class="alert alert-error shadow-lg m-4">
        <span>{{ error?.message || 'Failed to load sub-board' }}</span>
      </div>
    </template>

    <!-- Kanban Columns (filtered) -->
    <template v-else-if="visibleColumns.length || reviewColumn">
      <div class="flex flex-row flex-wrap justify-center gap-x-3 gap-y-8 mt-8 w-full max-w-full p-4">
          <div
            v-for="column in visibleColumns"
            :key="column.id + '-' + (column.tasks ?? []).map((t: iTask) => t.id).join(',')"
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
              <div v-for="task in (column.tasks ?? [])" :key="task.id">
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

    <!-- Empty state -->
    <template v-else>
      <div class="flex flex-col items-center justify-center h-full py-8 text-base-content/60">
        <span>No columns found for this sub-board.</span>
      </div>
    </template>
  </div>
</template>
