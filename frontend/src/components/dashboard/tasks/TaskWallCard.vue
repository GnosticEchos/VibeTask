<script setup lang="ts">
import TaskTile from '@/components/dashboard/tasks/TaskTile.vue'
import type { iTask } from '@/types/taskTypes'

defineProps<{
  task: iTask
  selected?: boolean
}>()

defineEmits<{
  toggleSelect: []
}>()
</script>

<template>
  <div
    class="relative w-full rounded-box transition-all cursor-pointer"
    :class="selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-200' : 'ring-0'"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="selected ? `Deselect ${task.identifier}` : `Select ${task.identifier}`"
    @click="$emit('toggleSelect')"
    @keydown.enter.prevent="$emit('toggleSelect')"
    @keydown.space.prevent="$emit('toggleSelect')"
  >
    <TaskTile :task="task" />
    <span
      v-if="selected"
      class="absolute top-2 right-2 badge badge-primary badge-sm pointer-events-none"
      aria-hidden="true"
    >
      ✓
    </span>
  </div>
</template>
