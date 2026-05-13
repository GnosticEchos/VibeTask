<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useDocumentsQuery, useDocumentMutations } from '@/composables/useDocumentMutations'
import DocsListView from '@/components/dashboard/docs/DocsListView.vue'
import DocumentEditor from '@/components/dashboard/docs/DocumentEditor.vue'
import type { DocType } from '@/types/documentTypes'

const route = useRoute()
const projectStore = useProjectStore()

const projectId = computed(() => Number(route.params.id))
const selectedDocId = ref<number | null>(null)
const isCreating = ref(false)
const showEditor = computed(() => selectedDocId.value !== null || isCreating.value)

const { data: docsData, isLoading: docsLoading, error: docsError } = useDocumentsQuery(projectId)
const { createDocument, updateDocument } = useDocumentMutations(projectId)

// Auto-open document from query param (e.g., ?doc=123 from TaskDialog)
watch(docsData, (data) => {
  if (data && route.query.doc) {
    const docId = Number(route.query.doc)
    const docExists = data.data?.some((d: any) => d.id === docId)
    if (docExists) {
      selectedDocId.value = docId
      // Note: We don't clean up the query param to preserve back button behavior.
      // The watch only fires when docsData changes, so this won't re-trigger.
    }
  }
}, { immediate: true })

const documents = computed(() => docsData.value?.data || [])
const selectedDocument = computed(() => {
  if (!selectedDocId.value) return null
  return documents.value.find((d: any) => d.id === selectedDocId.value) || null
})

const userRole = computed(() => projectStore.project?.role || 'Viewer')
const canEdit = computed(() => ['Owner', 'Maintainer', 'Editor'].includes(userRole.value))

function handleOpenDoc(docId: number) {
  selectedDocId.value = docId
  isCreating.value = false
}

function handleCreate() {
  isCreating.value = true
  selectedDocId.value = null
}

async function handleSaveNew(payload: { title: string; content: string; docType: string }) {
  const doc = await createDocument({ title: payload.title, content: payload.content, docType: payload.docType as DocType })
  selectedDocId.value = doc.id
  isCreating.value = false
}

async function handleSaveExisting(payload: { title: string; content: string; docType: string }) {
  if (!selectedDocId.value) return
  await updateDocument({ docId: selectedDocId.value, payload: { title: payload.title, content: payload.content, docType: payload.docType as DocType } })
}

function handleBack() {
  selectedDocId.value = null
  isCreating.value = false
}
</script>

<template>
  <div class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary to-80% flex-1 min-h-0 relative">
    <div class="mx-auto w-full max-w-[1500px] px-4 py-4 sm:px-6">
      <!-- Document list -->
      <DocsListView
        :documents="documents"
        :loading="docsLoading"
        :error="docsError ? String(docsError) : null"
        :can-edit="canEdit"
        @create="handleCreate"
        @open="handleOpenDoc"
      />
    </div>

    <!-- Document editor modal using global Dialog system -->
    <Teleport to="body">
      <div
        v-if="showEditor"
        class="modal modal-open fixed inset-0 flex items-center justify-center z-50"
        @click.self="handleBack"
      >
        <div class="modal-box shadow-2xl rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden bg-base-100">
          <DocumentEditor
            :document="selectedDocument"
            :can-edit="canEdit"
            :loading="false"
            @back="handleBack"
            @save="isCreating ? handleSaveNew($event) : handleSaveExisting($event)"
          />
        </div>
        <div class="modal-backdrop bg-base-100/70" @click="handleBack"></div>
      </div>
    </Teleport>
  </div>
</template>
