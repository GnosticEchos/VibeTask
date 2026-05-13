<script setup lang="ts">
import { iTaskLog } from '@/types/taskTypes'

defineProps({
  history: {
    type: Array as () => iTaskLog[],
    required: true,
  },
})
</script>

<template>
  <div class="history-wrapper px-2 pt-3">
    <div v-for="log in history" class="log flex items-start mb-3">
      <img class="log__avatar mr-3" :src="log.user.avatarUrl" alt="Log user avatar" />
      <div class="flex flex-col">
        <div class="flex">
          <span class="log__user mr-2">{{ log.user.fullName }}</span>
          <span class="log__date">{{ log.createdAt }}</span>
        </div>
        <span class="log__text mt-1">{{ log.text }}</span>
      </div>
    </div>
  </div>
</template>
