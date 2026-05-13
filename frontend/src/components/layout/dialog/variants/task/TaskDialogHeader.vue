<script setup lang="ts">
import type { iTask } from '@/types/taskTypes'
import { getDisplayName } from '@/utils/functions'
import RefreshIcon from '@/components/icons/RefreshIcon.vue'

defineProps<{
  task: iTask
  refreshing?: boolean
}>()

defineEmits<{
  refresh: []
}>()
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-outline font-mono">{{ task.identifier || 'Task' }}</span>
          <span v-if="task.parentId" class="badge badge-ghost badge-sm">{{ $t('taskDialog.subTask') }}</span>
          <span v-if="task.isContainer" class="badge badge-primary badge-sm">{{ $t('taskDialog.container') }}</span>
        </div>
        <h2
          id="modal-title"
          class="mt-2 truncate text-lg font-bold outline-none"
          tabindex="0"
          :title="task.name"
        >
          {{ task.name || $t('taskDialog.details') }}
        </h2>
        <p class="mt-1 text-xs text-base-content/60">
          {{ $t('tasks.createdBy') }}: {{ getDisplayName(task.createdBy) || '-' }}
          <span v-if="task.updatedAt" class="ml-2">{{ $t('taskDialog.updated') }}: {{ task.updatedAt }}</span>
        </p>
      </div>

      <button
        class="btn btn-ghost btn-sm"
        type="button"
        :disabled="refreshing"
        :aria-label="$t('taskDialog.refreshTask')"
        @click="$emit('refresh')"
      >
        <RefreshIcon class="h-4 w-4" />
        <span v-if="refreshing" class="loading loading-spinner loading-xs" />
      </button>
    </div>
    <div class="divider my-0" />
  </div>
</template>
