<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { iTask } from '@/types/taskTypes'

const props = defineProps<{
  tasks: iTask[]
  total: number
  page: number
  limit: number
  isLoading?: boolean
  isOpen?: boolean
  projectName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pageChange', page: number): void
  (e: 'openTask', task: iTask): void
}>()

const { t } = useI18n()

const totalPages = computed(() => Math.ceil(props.total / props.limit))
const hasResults = computed(() => props.tasks.length > 0)

function getTaskIdentifier(task: iTask): string {
  return task.identifier || `Task-${task.id}`
}

function getTaskProject(task: iTask): string {
  if (props.projectName) return props.projectName
  return task.project?.name || task.project?.prefix || ''
}

function navigateToTask(task: iTask) {
  emit('openTask', task)
  emit('close')
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    emit('pageChange', page)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-start justify-center pt-20"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/50"
        @click="emit('close')"
      />

      <!-- Overlay panel -->
      <div class="relative w-full max-w-2xl max-h-[70vh] bg-base-100 rounded-lg shadow-2xl border border-base-300 flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-base-300">
          <h3 class="font-semibold">{{ t('search.results') }}</h3>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            @click="emit('close')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- Results -->
        <div v-else-if="hasResults" class="flex-1 overflow-y-auto">
          <ul class="divide-y divide-base-200">
            <li
              v-for="task in tasks"
              :key="task.id"
              class="p-3 hover:bg-base-200 cursor-pointer transition-colors"
              @click="navigateToTask(task)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-sm badge-ghost font-mono">{{ getTaskIdentifier(task) }}</span>
                    <span v-if="task.project" class="text-xs text-base-content/60">
                      {{ getTaskProject(task) }}
                    </span>
                  </div>
                  <p class="font-medium truncate mt-1">{{ task.name }}</p>
                  <p v-if="task.description" class="text-sm text-base-content/70 line-clamp-2 mt-0.5">
                    {{ task.description }}
                  </p>
                  <div class="flex flex-wrap gap-1 mt-2">
                    <span v-if="task.status" class="badge badge-xs" :class="{
                      'badge-success': task.status === 'done',
                      'badge-warning': task.status === 'inProgress',
                      'badge-info': task.status === 'todo',
                    }">
                      {{ task.status }}
                    </span>
                    <span v-if="task.priority" class="badge badge-xs badge-outline" :class="{
                      'badge-error': task.priority === 'high',
                      'badge-warning': task.priority === 'medium',
                    }">
                      {{ task.priority }}
                    </span>
                    <span v-if="task.assignee" class="badge badge-xs badge-outline">
                      {{ task.assignee.fullName || 'Unassigned' }}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          </ul>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 p-3 border-t border-base-300">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="page <= 1"
              @click="goToPage(page - 1)"
            >
              {{ t('search.prev') }}
            </button>
            <span class="text-sm">
              {{ t('search.pageOf', { page, total: totalPages }) }}
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="page >= totalPages"
              @click="goToPage(page + 1)"
            >
              {{ t('search.next') }}
            </button>
          </div>
        </div>

        <!-- No results -->
        <div v-else class="flex flex-col items-center justify-center py-12 text-base-content/60">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>{{ t('search.noResults') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
