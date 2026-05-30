<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectDetailSummaryScope } from '@/composables/useProjectDetailSummaryQuery'
import { useProjectDetailSummaryQuery } from '@/composables/useProjectDetailSummaryQuery'
import { columnMainTaskCount, projectMainBoardTaskTotal } from '@/types/projectStatsTypes'

export type ProjectBoardCountMode = 'main' | 'all'

const props = defineProps<{
  projectId: number
  /** When set, stats are scoped to this workspace (no main/all toggle). */
  workspaceId?: number | null
  workspaceLabel?: string | null
}>()

const countMode = defineModel<ProjectBoardCountMode>('countMode', { default: 'main' })

const emit = defineEmits<{
  openMembers: []
}>()

const effectiveScope = computed((): ProjectDetailSummaryScope => {
  if (props.workspaceId != null) {
    return { kind: 'workspace', workspaceId: props.workspaceId }
  }
  if (countMode.value === 'all') return { kind: 'all' }
  return { kind: 'main' }
})

const showScopeToggle = computed(() => props.workspaceId == null)

const { data, isLoading, isFetching, isError } = useProjectDetailSummaryQuery(
  () => props.projectId,
  effectiveScope,
)

const project = computed(() => data.value?.project)
const members = computed(() => data.value?.members ?? [])

const taskTotal = computed(() => {
  const stats = project.value
  if (!stats) return 0
  if (effectiveScope.value.kind === 'all') return stats.totalTasks ?? 0
  if (effectiveScope.value.kind === 'workspace') {
    return stats.mainBoardTasks ?? stats.totalTasks ?? 0
  }
  return projectMainBoardTaskTotal(stats)
})

const columnChips = computed(() => {
  const stats = project.value
  if (!stats?.columns?.length) return []
  const useAll = effectiveScope.value.kind === 'all'
  return stats.columns
    .filter((col) => col.roleType !== 'AGENT_REVIEW')
    .map((col) => ({
      name: col.name,
      count: useAll ? (col.taskCountAll ?? col.taskCount ?? 0) : columnMainTaskCount(col),
      color: col.color || '#3b82f6',
    }))
    .filter((col) => col.count > 0)
})

const scopeHint = computed(() => {
  if (!showScopeToggle.value) return null
  if (countMode.value === 'all') {
    return 'Counts and board include workspace tasks in each column.'
  }
  return 'Main-board tasks only; workspace children are hidden on the board.'
})
</script>

<template>
  <div
    class="flex flex-col gap-1 border-b border-base-300/60 bg-base-200/40 px-3 py-1.5 text-xs"
    aria-live="polite"
  >
    <div class="flex flex-wrap items-center gap-2">
      <div v-if="showScopeToggle" class="flex items-center gap-1" role="group" aria-label="Task count scope">
        <button
          type="button"
          class="btn btn-xs"
          :class="countMode === 'main' ? 'btn-primary' : 'btn-ghost'"
          :aria-pressed="countMode === 'main'"
          @click="countMode = 'main'"
        >
          Main board
        </button>
        <button
          type="button"
          class="btn btn-xs"
          :class="countMode === 'all' ? 'btn-primary' : 'btn-ghost'"
          :aria-pressed="countMode === 'all'"
          @click="countMode = 'all'"
        >
          All tasks
        </button>
      </div>
      <span v-else class="badge badge-ghost badge-sm font-medium">
        {{ workspaceLabel ? `Workspace · ${workspaceLabel}` : `Workspace · #${workspaceId}` }}
      </span>

      <span
        v-if="isLoading || isFetching"
        class="loading loading-spinner loading-xs"
        :title="isFetching ? 'Updating counts…' : 'Loading counts…'"
      />
      <template v-else-if="isError">
        <span class="text-base-content/50">Stats unavailable</span>
      </template>
      <template v-else-if="project">
        <span class="font-medium text-base-content/80">{{ taskTotal }} tasks</span>
        <span
          v-for="chip in columnChips"
          :key="`${countMode}-${chip.name}`"
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
          v-if="effectiveScope.kind === 'main' && (project.workspaceChildTasks ?? 0) > 0"
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
    <p v-if="scopeHint && !isLoading" class="text-[0.65rem] text-base-content/45 leading-tight">
      {{ scopeHint }}
    </p>
  </div>
</template>
