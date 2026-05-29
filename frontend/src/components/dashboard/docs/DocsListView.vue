<template>
  <div class="flex gap-4 h-full min-h-0">
    <!-- Sidebar for document types -->
    <aside class="w-48 shrink-0 self-stretch rounded-2xl border border-base-300/60 bg-base-100/80 p-3 backdrop-blur-md">
      <h3 class="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 pb-2">
        Document Types
      </h3>
      <nav class="menu menu-xs p-0 gap-1">
        <li v-for="type in docTypes" :key="type.value">
          <button
            class="flex items-center justify-between"
            :class="{
              'bg-primary/15 text-primary font-semibold': selectedType === type.value,
            }"
            @click="selectedType = selectedType === type.value ? '' : type.value"
          >
            <span class="truncate text-sm">{{ type.label }}</span>
            <span
              v-if="type.value"
              class="badge badge-xs badge-ghost"
            >
              {{ getTypeCount(type.value) }}
            </span>
          </button>
        </li>
      </nav>
    </aside>

    <!-- Main content -->
    <div class="flex-1 self-stretch rounded-2xl border border-base-300/60 bg-base-100/80 p-4 shadow-sm backdrop-blur-md min-h-0">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">{{ $t('docs.title') || 'Project Documents' }}</h2>
          <p class="text-xs text-base-content/50">{{ filteredCount }} document{{ filteredCount === 1 ? '' : 's' }}</p>
        </div>
        <button
          v-if="canEdit"
          class="btn btn-primary btn-sm"
          @click="emit('create')"
        >
          {{ $t('docs.newDocument') || 'New Document' }}
        </button>
      </div>

      <!-- Search -->
      <div class="mb-4">
        <div class="relative">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search documents..."
            class="input input-bordered input-sm w-full pl-10"
          />
          <button
            v-if="searchQuery"
            class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
            @click="searchQuery = ''"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-8">
        <span class="loading loading-spinner loading-lg"></span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="alert alert-error">
        <span>{{ error }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="documents.length === 0" class="text-center py-12 text-base-content/50 rounded-xl border border-dashed border-base-300/60 bg-base-100/40">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="mb-2 font-medium">No documents yet</p>
        <p class="text-sm mb-4">Get started by creating your first project document</p>
        <button v-if="canEdit" class="btn btn-primary btn-sm" @click="emit('create')">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Document
        </button>
      </div>

      <!-- Document grid -->
      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="card bg-base-100/60 border border-base-300/60 shadow-sm hover:shadow-md hover:border-primary/30 cursor-pointer transition-all"
          @click="emit('open', doc.id)"
        >
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-2 mb-2">
              <h3 class="card-title text-sm font-medium line-clamp-2 flex-1">{{ doc.title }}</h3>
              <button
                v-if="canEdit"
                type="button"
                class="btn btn-ghost btn-xs btn-square text-error shrink-0"
                :disabled="deleteLoading"
                :aria-label="$t('docs.delete')"
                @click.stop="emit('delete', doc.id, doc.title)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <p class="text-xs text-base-content/60 line-clamp-3 mb-3">{{ doc.content?.slice(0, 150) || 'Empty document' }}</p>
            <div class="flex items-center justify-between text-xs text-base-content/40">
              <div class="flex items-center gap-1">
                <span class="badge badge-xs badge-outline">{{ formatDocType(doc.docType) }}</span>
                <span>v{{ doc.version }}</span>
              </div>
              <span>{{ formatDate(doc.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProjectDocument, DocType } from '../../../types/documentTypes'

const props = defineProps<{
  documents: ProjectDocument[]
  loading: boolean
  error: string | null
  canEdit: boolean
  deleteLoading?: boolean
}>()

const emit = defineEmits<{
  create: []
  open: [docId: number]
  delete: [docId: number, title?: string]
}>()

const selectedType = ref('')
const searchQuery = ref('')

const documents = computed(() => {
  let result = props.documents
  
  // Filter by type
  if (selectedType.value) {
    result = result.filter(d => d.docType === selectedType.value)
  }
  
  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(d => 
      d.title.toLowerCase().includes(query) || 
      d.content?.toLowerCase().includes(query)
    )
  }
  
  return result
})

const filteredCount = computed(() => documents.value.length)

function getTypeCount(type: string): number {
  if (!type) return props.documents.length
  return props.documents.filter(d => d.docType === type).length
}

const docTypes: Array<{ value: DocType | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'CONSTITUTION', label: 'Constitution' },
  { value: 'SPECIFICATION', label: 'Specification' },
  { value: 'BRAINSTORM', label: 'Brainstorm' },
  { value: 'POST_MORTEM', label: 'Post-Mortem' },
  { value: 'IMPLEMENTATION_PLAN', label: 'Implementation Plan' },
  { value: 'OTHER', label: 'Other' },
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString()
}

function formatDocType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase()
}
</script>
