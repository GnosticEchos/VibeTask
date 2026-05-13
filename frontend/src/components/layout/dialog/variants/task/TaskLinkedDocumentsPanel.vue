<script setup lang="ts">
import type { DocLinkRole, ProjectDocument } from '@/types/documentTypes'

type TaskDialogDocumentLink = {
  id: number
  projectId?: number
  taskId?: number
  documentId?: number
  role: DocLinkRole | null
  pinnedVersion: number | null
  createdAt?: string
  document?: {
    id: number
    title: string
    docType: string
    version: number
  }
}

defineProps<{
  links: TaskDialogDocumentLink[]
  availableDocuments: ProjectDocument[]
  selectedDocumentId: number | ''
  loadingDocuments?: boolean
  addingLink?: boolean
  removingLinkId?: number | null
}>()

defineEmits<{
  openDoc: [docId: number]
  unlinkDoc: [linkId: number]
  loadDocuments: []
  addLink: []
  manageDocs: []
  'update:selectedDocumentId': [value: number | '']
}>()
</script>

<template>
  <section class="collapse collapse-arrow rounded-box border border-base-300 bg-base-100">
    <input type="checkbox" />
    <div class="collapse-title flex items-center justify-between gap-3">
      <div>
        <h3 class="font-semibold">
          {{ $t('taskDialog.linkedDocuments') }}
          <span class="badge badge-sm ml-2">{{ links.length }}</span>
        </h3>
        <p class="text-xs text-base-content/60">{{ $t('taskDialog.linkedDocumentsHint') }}</p>
      </div>
    </div>

    <div class="collapse-content">
      <div class="mb-3 flex justify-end">
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('manageDocs')">
          {{ $t('taskDialog.manageDocs') }}
        </button>
      </div>

      <div v-if="links.length" class="space-y-2">
        <div
          v-for="link in links"
          :key="link.id"
          class="flex items-center justify-between gap-2 rounded-box bg-base-200/60 px-3 py-2 text-sm"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="badge badge-xs">{{ link.role || 'REF' }}</span>
              <button
                v-if="link.document"
                type="button"
                class="link link-primary truncate text-left"
                @click="$emit('openDoc', link.document.id)"
              >
                {{ link.document.title }}
              </button>
              <span v-else class="truncate">{{ $t('taskDialog.documentId', { id: link.documentId }) }}</span>
            </div>
            <p v-if="link.document" class="mt-0.5 text-xs text-base-content/50">v{{ link.document.version }}</p>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-xs text-error"
            :disabled="removingLinkId === link.id"
            @click="$emit('unlinkDoc', link.id)"
          >
            <span v-if="removingLinkId === link.id" class="loading loading-spinner loading-xs" />
            <span v-else>{{ $t('taskDialog.unlinkDoc') }}</span>
          </button>
        </div>
      </div>
      <p v-else class="rounded-box bg-base-200/50 px-3 py-2 text-sm text-base-content/60">
        {{ $t('taskDialog.noLinkedDocuments') }}
      </p>

      <div class="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <select
          :value="selectedDocumentId"
          class="select select-bordered select-sm"
          :disabled="loadingDocuments"
          :aria-label="$t('taskDialog.selectDocument')"
          @focus="$emit('loadDocuments')"
          @change="$emit('update:selectedDocumentId', ($event.target as HTMLSelectElement).value === '' ? '' : Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="">{{ loadingDocuments ? $t('taskDialog.loadingDocuments') : $t('taskDialog.selectDocument') }}</option>
          <option v-for="doc in availableDocuments" :key="doc.id" :value="doc.id">{{ doc.title }}</option>
        </select>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!selectedDocumentId || addingLink"
          @click="$emit('addLink')"
        >
          <span v-if="addingLink" class="loading loading-spinner loading-xs" />
          <span v-else>{{ $t('taskDialog.linkDocument') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
