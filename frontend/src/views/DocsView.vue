<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useDocumentsQuery, useDocumentMutations } from '@/composables/useDocumentMutations'
import { useDocumentSearch } from '@/composables/useDocumentSearch'
import DocsListView from '@/components/dashboard/docs/DocsListView.vue'
import DocumentEditor from '@/components/dashboard/docs/DocumentEditor.vue'
import SearchInput from '@/components/search/SearchInput.vue'
import DocumentSearchOverlay from '@/components/search/DocumentSearchOverlay.vue'
import type { DocType } from '@/types/documentTypes'
import { useLayoutStore } from '@/stores/layout'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const { t } = useI18n()

const projectId = computed(() => Number(route.params.id))
const selectedDocId = ref<number | null>(null)
const isCreating = ref(false)
const showEditor = computed(() => selectedDocId.value !== null || isCreating.value)

const { data: docsData, isLoading: docsLoading, error: docsError } = useDocumentsQuery(projectId)
const { createDocument, updateDocument, deleteDocument, deleteLoading } = useDocumentMutations(projectId)

const docSearch = useDocumentSearch({ projectId })

watch(projectId, (id) => {
  if (Number.isFinite(id)) {
    docSearch.clearSearch()
  }
})

// Auto-open document from query param (e.g., ?doc=123 from TaskDialog)
watch(docsData, (data) => {
  if (data && route.query.doc) {
    const docId = Number(route.query.doc)
    const docExists = data.data?.some((d: { id: number }) => d.id === docId)
    if (docExists) {
      selectedDocId.value = docId
    }
  }
}, { immediate: true })

const documents = computed(() => docsData.value?.data || [])
const selectedDocument = computed(() => {
  if (!selectedDocId.value) return null
  return documents.value.find((d: { id: number }) => d.id === selectedDocId.value) || null
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
  const doc = await createDocument({
    title: payload.title,
    content: payload.content,
    docType: payload.docType as DocType,
  })
  selectedDocId.value = doc.id
  isCreating.value = false
}

async function handleSaveExisting(payload: { title: string; content: string; docType: string }) {
  if (!selectedDocId.value) return
  await updateDocument({
    docId: selectedDocId.value,
    payload: {
      title: payload.title,
      content: payload.content,
      docType: payload.docType as DocType,
    },
  })
}

function handleBack() {
  selectedDocId.value = null
  isCreating.value = false
}

function handleSearchFromOverlay(docId: number) {
  handleOpenDoc(docId)
}

async function confirmDeleteDocument(docId: number, title?: string) {
  const label = title?.trim() || `Document #${docId}`
  const ok = window.confirm(t('docs.deleteConfirm', { title: label }))
  if (!ok) return
  try {
    await deleteDocument(docId)
    if (selectedDocId.value === docId) {
      handleBack()
    }
    layoutStore.openToast({ message: t('docs.deleteSuccess'), type: 'success' })
  } catch {
    layoutStore.openToast({ message: t('docs.deleteError'), type: 'error' })
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary to-80% flex-1 min-h-0 relative">
    <div class="mx-auto w-full max-w-[1500px] px-4 py-4 sm:px-6">
      <div class="mb-4 max-w-xl">
        <SearchInput
          v-model="docSearch.searchQuery.value"
          :placeholder="t('docs.searchPlaceholder')"
          @search="docSearch.search"
          @clear="docSearch.clearSearch"
        />
        <p class="mt-1 text-xs text-base-content/50">{{ t('docs.searchHint') }}</p>
      </div>

      <DocumentSearchOverlay
        :is-open="docSearch.isOverlayOpen.value"
        :documents="docSearch.results.value"
        :total="docSearch.total.value"
        :page="docSearch.currentPage.value"
        :limit="docSearch.limit.value"
        :is-loading="docSearch.isLoading.value"
        :project-name="projectStore.project?.name"
        @close="docSearch.closeOverlay"
        @page-change="docSearch.goToPage"
        @open-document="(doc) => handleSearchFromOverlay(doc.id)"
      />

      <DocsListView
        :documents="documents"
        :loading="docsLoading"
        :error="docsError ? String(docsError) : null"
        :can-edit="canEdit"
        :delete-loading="deleteLoading"
        @create="handleCreate"
        @open="handleOpenDoc"
        @delete="confirmDeleteDocument"
      />
    </div>

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
            @delete="selectedDocument && confirmDeleteDocument(selectedDocument.id, selectedDocument.title)"
          />
        </div>
        <div class="modal-backdrop bg-base-100/70" @click="handleBack" />
      </div>
    </Teleport>
  </div>
</template>
