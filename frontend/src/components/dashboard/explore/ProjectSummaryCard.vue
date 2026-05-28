<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import type { ProjectStats } from '@/types/projectStatsTypes'
import { columnMainTaskCount, projectMainBoardTaskTotal } from '@/types/projectStatsTypes'
import type { ProjectsSummaryScope } from '@/composables/useProjectsSummaryQuery'

const props = defineProps({
  project: {
    type: Object as PropType<ProjectStats>,
    required: true,
  },
  scope: {
    type: String as PropType<ProjectsSummaryScope>,
    required: true,
  },
})

const taskStatusSummary = computed(() => {
  const columns = props.project.columns ?? []
  const useAllScope = props.scope === 'all'
  return columns.map((column) => ({
    name: column.name,
    count: useAllScope ? (column.taskCountAll ?? column.taskCount ?? 0) : columnMainTaskCount(column),
    color: column.color || '#3b82f6',
  }))
})

const scopedTotal = computed(() => {
  if (props.scope === 'all') {
    return props.project.totalTasks ?? 0
  }
  return projectMainBoardTaskTotal(props.project)
})

const workspaceChildTasks = computed(() => props.project.workspaceChildTasks ?? 0)

const ensureHex = (color: string) => {
  if (!color) return '#000000'
  if (color[0] !== '#') return `#${color}`
  return color
}
</script>

<template>
  <div
    class="card bg-base-100 shadow-md border border-base-300 hover:shadow-lg transform hover:translate-x-2 hover:translate-y-2 transition-all duration-300 hover:scale-105 rounded-box w-[300px] h-[365px]"
    style="--depth: 1; --noise: 1;"
  >
    <div class="card-body p-4">
      <div class="text-center mb-2">
        <h2 class="card-title text-base-content font-semibold justify-center">{{ project.name }}</h2>
        <span class="badge badge-ghost badge-sm mt-1">{{ project.prefix }}</span>
      </div>

      <p class="text-base-content/80 text-sm mb-4 h-16 overflow-y-auto">
        {{ project.description || ' ' }}
      </p>

      <div v-if="scopedTotal > 0" class="mb-3">
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium">{{ scope === 'all' ? 'Tasks (all)' : 'Tasks (main board)' }}</span>
          <span>{{ scopedTotal }}</span>
        </div>
        <div class="w-full h-2 bg-base-200 rounded-full overflow-hidden">
          <div
            v-for="status in taskStatusSummary"
            :key="status.name"
            class="h-full float-left"
            :style="{
              width: `${(status.count / scopedTotal) * 100}%`,
              backgroundColor: ensureHex(status.color),
            }"
            :title="`${status.name}: ${status.count} tasks`"
          />
        </div>
      </div>

      <p
        v-if="scope === 'main' && workspaceChildTasks > 0"
        class="text-xs text-base-content/60 text-center mb-2"
      >
        +{{ workspaceChildTasks }} in workspaces
      </p>

      <div class="flex flex-wrap gap-1 mt-2 justify-center">
        <div
          v-for="(column, index) in project.columns?.slice(0, 3)"
          :key="column.id"
          class="badge badge-xs"
          :class="index % 3 === 0 ? 'badge-primary' : index % 3 === 1 ? 'badge-secondary' : 'badge-accent'"
        >
          {{ column.name }}
        </div>
        <div
          v-if="project.columns && project.columns.length > 3"
          class="badge badge-xs badge-ghost"
        >
          +{{ project.columns.length - 3 }}
        </div>
      </div>

      <div class="card-footer mt-auto pt-2 text-center">
        <div class="badge badge-outline badge-primary">{{ scopedTotal }} tasks</div>
      </div>
    </div>
  </div>
</template>
