<script setup lang="ts">
import { computed } from 'vue'
import { useUserTasksQuery, type UserTaskItem } from '@/composables/useUserTasksQuery'

const { data: userTasksData } = useUserTasksQuery()
const userTasks = computed<UserTaskItem[]>(() => userTasksData.value ?? [])
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div>
    <h2 class="text-lg font-bold mb-2 text-base-content">My Tasks</h2>
    <div class="flex flex-wrap gap-2">
      <router-link
        v-for="task in userTasks"
        :key="task.id"
        :to="`/dashboard/project/${task.projectId ?? 0}`"
      >
        <span class="badge badge-info">{{ task.name }}</span>
      </router-link>
    </div>
  </div>
</template> 