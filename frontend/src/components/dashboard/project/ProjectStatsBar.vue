<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectDetailSummaryScope } from '@/composables/useProjectDetailSummaryQuery'
import { useProjectDetailSummaryQuery } from '@/composables/useProjectDetailSummaryQuery'
import { columnMainTaskCount, projectMainBoardTaskTotal } from '@/types/projectStatsTypes'

const props = defineProps<{
  projectId: number
  scope: ProjectDetailSummaryScope
  workspaceLabel?: string | null
}>()

const emit = defineEmits<{
  openMembers: []
}>()

const { data, isLoading, isError } = useProjectDetailSummaryQuery(
  () => props.projectId,
  () => props.scope,
)

const project = computed(() => data.value?.project)
const members = computed(() => data.value?.members ?? [])

const scopeLabel = computed(() => {
  if (props.scope.kind === 'workspace') {
    return props.workspaceLabel
      ? `Workspace · ${props.workspaceLabel}`
      : `Workspace · #${props.scope.workspaceId}`
  }
  if (props.scope.kind === 'all') return 'All tasks'
  return 'Main board'
})

const taskTotal = computed(() => {
  const stats = project.value
  if (!stats) return 0
  if (props.scope.kind === 'all') return stats.totalTasks ?? 0
  return projectMainBoardTaskTotal(stats)
})

const columnChips = computed(() => {
  const stats = project.value
  if (!stats?.columns?.length) return []
  const useAll = props.scope.kind === 'all'
  return stats.columns
    .filter((col) => col.roleType !== 'AGENT_REVIEW')
    .map((col) => ({
      name: col.name,
      count: useAll ? (col.taskCountAll ?? col.taskCount ?? 0) : columnMainTaskCount(col),
      color: col.color || '#3b82f6',
    }))
    .filter((col) => col.count > 0)
})
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b border-base-300/60 bg-base-200/40 px-3 py-1.5 text-xs"
    aria-live="polite"
  >
    <span class="badge badge-ghost badge-sm font-medium">{{ scopeLabel }}</span>

    <template v-if="isLoading">
      <span class="loading loading-spinner loading-xs" />
    </template>
    <template v-else-if="isError">
      <span class="text-base-content/50">Stats unavailable</span>
    </template>
    <template v-else-if="project">
      <span class="font-medium text-base-content/80">{{ taskTotal }} tasks</span>
      <span
        v-for="chip in columnChips"
        :key="chip.name"
        class="badge badge-sm gap-1 border-0"
        :style="{ backgroundColor: `${chip.color}22`, color: chip.color }"
        :title="`${chip.name}: ${chip.count}`"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full"
          :style="{ backgroundColor: chip.color }"
        />
        {{ chip.name }} {{ chip.count }}
      </span>
      <span
        v-if="props.scope.kind === 'main' && (project.workspaceChildTasks ?? 0) > 0"
        class="text-base-content/50"
      >
        +{{ project.workspaceChildTasks }} in workspaces
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs ml-auto"
        @click="emit('openMembers')"
      >
        {{ members.length }} member{{ members.length === 1 ? '' : 's' }}
      </button>
    </template>
  </div>
</template>
