<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import TaskWallCard from '@/components/dashboard/tasks/TaskWallCard.vue'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useBacklogStore } from '@/stores/backlog'
import { useArchiveStore } from '@/stores/archive'
import { axiosApi } from '@/api/axios'
import type { iTask } from '@/types/taskTypes'
import type { ProjectBoardCountMode } from '@/types/projectBoardScope'
import {
  TASK_STATUS_ARCHIVE,
  TASK_STATUS_BACKLOG,
  boardColumnOptions,
  patchPayloadForTaskStatus,
  taskStatusFromSelectValue,
  type TaskStatusValue,
} from '@/utils/taskStatusAssignment'
import { uiLog } from '@/utils/logger'

const props = defineProps<{
  tasks: iTask[]
  wallMode: Extract<ProjectBoardCountMode, 'backlog' | 'archive'>
  isLoading?: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const backlogStore = useBacklogStore()
const archiveStore = useArchiveStore()
const queryClient = useQueryClient()

const selectedIds = ref<Set<number>>(new Set())
const batchStatus = ref<string>('')
const isApplying = ref(false)

const cardMinWidth = computed(() => `calc(220px * ${layoutStore.boardScale})`)

const columnOptions = computed(() => boardColumnOptions(projectStore.project?.columns))

const selectedCount = computed(() => selectedIds.value.size)

watch(
  () => props.tasks.map((t) => t.id).join(','),
  () => {
    selectedIds.value = new Set()
    batchStatus.value = ''
  },
)

function toggleSelect(taskId: number) {
  const next = new Set(selectedIds.value)
  if (next.has(taskId)) next.delete(taskId)
  else next.add(taskId)
  selectedIds.value = next
}

function selectAll() {
  selectedIds.value = new Set(props.tasks.map((t) => t.id))
}

function clearSelection() {
  selectedIds.value = new Set()
}

async function refreshLists() {
  const projectId = projectStore.project?.id
  if (!projectId) return
  await Promise.all([
    backlogStore.fetchBacklogTasks(projectId),
    archiveStore.fetchArchivedTasks(projectId),
    queryClient.invalidateQueries({ queryKey: ['board', projectId] }),
  ])
}

async function applyBatchStatus() {
  if (!batchStatus.value || selectedIds.value.size === 0 || isApplying.value) return
  const status = taskStatusFromSelectValue(batchStatus.value) as TaskStatusValue
  const payload = patchPayloadForTaskStatus(status)
  isApplying.value = true
  try {
    const ids = [...selectedIds.value]
    await Promise.all(ids.map((id) => axiosApi.patch(`/tasks/${id}`, payload)))
    await refreshLists()
    clearSelection()
    batchStatus.value = ''
    emit('updated')
    layoutStore.openToast({
      message: `Updated status for ${ids.length} task${ids.length === 1 ? '' : 's'}.`,
      type: 'success',
    })
  } catch (err) {
    uiLog.error('TaskWall batch status failed', { err })
    layoutStore.openToast({ message: 'Could not update selected tasks.', type: 'error' })
    await refreshLists()
  } finally {
    isApplying.value = false
  }
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <span class="loading loading-spinner loading-lg text-primary" />
  </div>
  <template v-else-if="tasks.length">
    <div
      class="flex flex-wrap items-center gap-2 px-4 py-2 mt-2 border-b border-base-300/40 bg-base-100/40"
      role="toolbar"
      :aria-label="$t('project.batchStatusToolbar')"
    >
      <span class="text-xs text-base-content/70 min-w-[5rem]">
        {{ selectedCount ? `${selectedCount} selected` : 'Select cards' }}
      </span>
      <button type="button" class="btn btn-ghost btn-xs" @click="selectAll">
        {{ $t('project.selectAll') }}
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        :disabled="!selectedCount"
        @click="clearSelection"
      >
        {{ $t('project.clearSelection') }}
      </button>
      <label class="flex items-center gap-2 ml-auto">
        <span class="text-xs text-base-content/60">{{ $t('tasks.status') }}</span>
        <select
          v-model="batchStatus"
          class="select select-bordered select-xs min-w-[10rem]"
          :disabled="!selectedCount || isApplying"
          :aria-label="$t('project.batchSetStatus')"
        >
          <option value="" disabled>{{ $t('project.chooseStatus') }}</option>
          <option :value="TASK_STATUS_BACKLOG">{{ $t('project.backlog') }}</option>
          <option v-for="col in columnOptions" :key="col.id" :value="String(col.id)">
            {{ col.name }}
          </option>
          <option :value="TASK_STATUS_ARCHIVE">{{ $t('project.archive') }}</option>
        </select>
        <button
          type="button"
          class="btn btn-primary btn-xs"
          :disabled="!selectedCount || !batchStatus || isApplying"
          @click="applyBatchStatus"
        >
          <span v-if="isApplying" class="loading loading-spinner loading-xs" />
          {{ $t('project.applyStatus') }}
        </button>
      </label>
    </div>

    <div
      class="grid gap-4 px-4 pb-8 mt-4 w-full max-w-full justify-items-center"
      :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}, 1fr))` }"
    >
      <div
        v-for="task in tasks"
        :key="task.id"
        class="w-full transition-[min-width,max-width] duration-200 ease-in-out"
        :style="{ minWidth: cardMinWidth, maxWidth: cardMinWidth }"
      >
        <TaskWallCard
          :task="task"
          :selected="selectedIds.has(task.id)"
          @toggle-select="toggleSelect(task.id)"
        />
      </div>
    </div>
  </template>
  <div v-else class="flex flex-col items-center justify-center py-12 text-base-content/60 px-4">
    <span v-if="wallMode === 'backlog'">{{ $t('project.backlogEmpty') }}</span>
    <span v-else>{{ $t('project.archiveEmpty') }}</span>
  </div>
</template>
