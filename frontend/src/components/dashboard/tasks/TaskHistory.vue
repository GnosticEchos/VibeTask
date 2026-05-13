<script setup lang="ts">
import type { iTaskLog } from '@/types/taskTypes'

defineProps<{
  history: iTaskLog[]
}>()
</script>

<template>
  <div class="collapse collapse-arrow bg-base-200 mt-2" aria-label="Task history">
    <input type="checkbox" />
    <div class="collapse-title font-semibold">
      Task History ({{ history.length }})
    </div>
    <div class="collapse-content">
      <ul class="space-y-1">
        <li
          v-for="log in history"
          :key="log.id"
          class="text-xs"
        >
          {{ log.createdAt }}: {{ log.text }}
        </li>
        <li v-if="!history.length" class="italic text-base-content/60">
          No history yet.
        </li>
      </ul>
    </div>
  </div>
</template>
