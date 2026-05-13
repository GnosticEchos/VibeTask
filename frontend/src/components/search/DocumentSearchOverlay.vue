<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DocumentSearchResult } from '@/composables/useDocumentSearch'

const props = defineProps<{
  documents: DocumentSearchResult[]
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
  (e: 'openDocument', doc: DocumentSearchResult): void
}>()

const { t } = useI18n()

const totalPages = computed(() => Math.ceil(props.total / props.limit))
const hasResults = computed(() => props.documents.length > 0)

function getDocTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    CONSTITUTION: 'Constitution',
    SPECIFICATION: 'Specification',
    BRAINSTORM: 'Brainstorm',
    POST_MORTEM: 'Post Mortem',
    IMPLEMENTATION_PLAN: 'Implementation Plan',
    OTHER: 'Other',
  }
  return labels[type] || type
}

function getDocTypeClass(type: string): string {
  const classes: Record<string, string> = {
    CONSTITUTION: 'badge-primary',
    SPECIFICATION: 'badge-info',
    BRAINSTORM: 'badge-warning',
    POST_MORTEM: 'badge-error',
    IMPLEMENTATION_PLAN: 'badge-success',
    OTHER: 'badge-ghost',
  }
  return classes[type] || 'badge-ghost'
}

function openDocument(doc: DocumentSearchResult) {
  emit('openDocument', doc)
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
      <div class="relative w-full max-w-3xl max-h-[70vh] bg-base-100 rounded-lg shadow-2xl border border-base-300 flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-base-300">
          <h3 class="font-semibold">{{ t('documents.searchResults') }}</h3>
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
              v-for="doc in documents"
              :key="doc.id"
              class="p-4 hover:bg-base-200 cursor-pointer transition-colors"
              @click="openDocument(doc)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-sm" :class="getDocTypeClass(doc.docType)">
                      {{ getDocTypeLabel(doc.docType) }}
                    </span>
                    <span v-if="projectName" class="text-xs text-base-content/60">
                      {{ projectName }}
                    </span>
                  </div>
                  <p class="font-medium truncate mt-1">{{ doc.title }}</p>
                  <!-- Search snippet with highlighted matches -->
                  <p
                    v-if="doc.snippet"
                    class="text-sm text-base-content/70 mt-2 line-clamp-2"
                    v-html="doc.snippet"
                  />
                  <div class="flex items-center gap-2 mt-2 text-xs text-base-content/50">
                    <span>By {{ doc.createdBy?.name }} {{ doc.createdBy?.surname }}</span>
                    <span>•</span>
                    <span>{{ new Date(doc.updatedAt).toLocaleDateString() }}</span>
                    <span v-if="doc.rank" class="ml-auto">Relevance: {{ (doc.rank * 100).toFixed(1) }}%</span>
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
          <p>{{ t('documents.noSearchResults') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
:deep(mark) {
  background-color: hsl(var(--wa) / 0.3);
  color: inherit;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
