<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-base-200 shrink-0">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <button class="btn btn-ghost btn-sm" @click="emit('back')">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <input
          v-if="canEdit"
          v-model="editTitle"
          class="input input-bordered input-sm flex-1 min-w-0"
          placeholder="Document title"
        />
        <h3 v-else class="font-medium truncate">{{ document?.title }}</h3>
        
        <!-- Document type dropdown -->
        <div class="dropdown dropdown-end" v-if="canEdit">
          <label tabindex="0" class="badge badge-sm hover:badge-primary cursor-pointer gap-1">
            {{ formatDocType(editDocType) }}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </label>
          <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300">
            <li v-for="type in docTypes" :key="type.value">
              <button 
                :class="{ 'active': editDocType === type.value }"
                @click="editDocType = type.value"
                class="text-sm"
              >
                {{ type.label }}
              </button>
            </li>
          </ul>
        </div>
        <span v-else class="badge badge-sm">{{ formatDocType(document?.docType || 'SPECIFICATION') }}</span>
        
        <span v-if="document" class="text-xs text-base-content/50">v{{ document.version }}</span>
      </div>
      <div class="flex items-center gap-1">
        <!-- Theme toggle -->
        <button
          v-if="isEditing && canEdit"
          class="btn btn-ghost btn-xs"
          :title="isDark ? 'Light mode' : 'Dark mode'"
          @click="toggleTheme"
        >
          <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
        <button
          v-if="canEdit && !isEditing"
          class="btn btn-ghost btn-xs"
          @click="isEditing = true"
          @mouseenter="preloadEditorOnHover"
        >
          Edit
        </button>
        <button
          v-if="isEditing"
          class="btn btn-primary btn-xs"
          :disabled="saving"
          @click="saveDocument"
        >
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          Save
        </button>
        <button
          v-if="isEditing"
          class="btn btn-ghost btn-xs"
          @click="cancelEdit"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Edit mode: md-editor-v3 with preview -->
      <div v-if="isEditing && canEdit" class="h-full relative">
        <!-- Loading state while md-editor-v3 loads -->
        <div v-if="!editorLoaded" class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
        <component
          :is="MdEditor"
          v-show="editorLoaded"
          v-model="editContent"
          :editor-id="editorId"
          language="en-US"
          :toolbars="toolbars"
          :toolbarsExclude="['image']"
          :preview="true"
          :show-toolbar="true"
          :autofocus="false"
          :theme="isDark ? 'dark' : 'light'"
          class="h-full"
          @save="saveDocument"
        />
      </div>

      <!-- View mode: same preview pipeline as edit (MdPreview + mermaid) -->
      <div v-else class="overflow-y-auto h-full p-4">
        <div v-if="!previewReady" class="flex justify-center py-8">
          <span class="loading loading-spinner loading-lg" />
        </div>
        <component
          v-else-if="document?.content"
          :is="MdPreview"
          :key="document.id"
          :model-value="document.content"
          :editor-id="`doc-read-${document.id}`"
          :theme="isDark ? 'dark' : 'light'"
          class="doc-md-preview"
        />
        <div v-else class="text-center py-8 text-base-content/50">
          Empty document — click Edit to add content
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, type Component } from 'vue'
import { useDark } from '@vueuse/core'
import type { ProjectDocument } from '../../../types/documentTypes'
import { useLayoutStore } from '@/stores/layout'
import { configureMdEditorMermaid } from '@/lib/md-editor-mermaid'

// Lazy-load md-editor-v3
let MdEditor: Component | null = null
let MdPreview: Component | null = null
const editorLoaded = ref(false)
const previewReady = ref(false)
const editorPreloadHover = ref(false)

async function loadMdEditorStyles() {
  await import('md-editor-v3/lib/style.css')
}

async function loadEditor() {
  if (MdEditor) return
  await configureMdEditorMermaid()
  const mod = await import('md-editor-v3')
  MdEditor = mod.MdEditor
  await loadMdEditorStyles()
  editorLoaded.value = true
}

async function loadPreview() {
  if (previewReady.value && MdPreview) return
  await configureMdEditorMermaid()
  const mod = await import('md-editor-v3')
  MdPreview = mod.MdPreview
  await loadMdEditorStyles()
  previewReady.value = true
}

function preloadEditorOnHover() {
  if (!editorPreloadHover.value) {
    editorPreloadHover.value = true
    loadEditor()
  }
}

const props = defineProps<{
  document: ProjectDocument | null
  canEdit: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  back: []
  save: [payload: { title: string; content: string; docType: string }]
}>()

const layoutStore = useLayoutStore()

const isDark = useDark({
  selector: 'html',
  attribute: 'data-theme',
  valueDark: 'dark',
  valueLight: 'light',
})

const editorId = `doc-editor-${Math.random().toString(36).slice(2, 9)}`
const isEditing = ref(false)
const editTitle = ref('')
const editContent = ref('')
const editDocType = ref('SPECIFICATION')
const saving = ref(false)

const docTypes = [
  { value: 'CONSTITUTION', label: 'Constitution' },
  { value: 'SPECIFICATION', label: 'Specification' },
  { value: 'BRAINSTORM', label: 'Brainstorm' },
  { value: 'POST_MORTEM', label: 'Post-Mortem' },
  { value: 'IMPLEMENTATION_PLAN', label: 'Implementation Plan' },
  { value: 'OTHER', label: 'Other' },
]

function formatDocType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase()
}

const toolbars = ref([
  'bold',
  'italic',
  'strikeThrough',
  'title',
  'sub',
  'sup',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  'code',
  'codeRow',
  'link',
  'image',
  'table',
  '-',
  'revoke',
  'next',
  'pageFullscreen',
  'preview',
  'fullscreen',
  'previewOnly',
])

// Load editor when entering edit mode, or preload on hover
watch(isEditing, async (editing) => {
  if (editing) {
    await loadEditor()
  } else if (props.document?.id) {
    await loadPreview()
  }
})

watch(
  () => props.document?.id,
  async (docId) => {
    if (docId && !isEditing.value) {
      await loadPreview()
    }
  },
  { immediate: true },
)

function toggleTheme() {
  isDark.value = !isDark.value
}

function cancelEdit() {
  isEditing.value = false
  if (props.document) {
    editTitle.value = props.document.title
    editContent.value = props.document.content
    editDocType.value = props.document.docType
  } else {
    editDocType.value = 'SPECIFICATION'
  }
}

async function saveDocument() {
  saving.value = true
  try {
    emit('save', { title: editTitle.value, content: editContent.value, docType: editDocType.value })
    isEditing.value = false
    layoutStore.openToast({ message: 'Document saved successfully', type: 'success' })
  } finally {
    saving.value = false
  }
}

watch(() => props.document, (doc) => {
  if (doc) {
    editTitle.value = doc.title
    editContent.value = doc.content
    editDocType.value = doc.docType
  }
}, { immediate: true })
</script>

<style>
.md-editor {
  height: 100% !important;
}

.md-editor .md-editor-toolbar-wrapper {
  height: 56px !important;
  min-height: 56px !important;
  display: flex !important;
  align-items: center !important;
  padding: 4px !important;
}

.md-editor .md-editor-toolbar {
  gap: 4px !important;
}

.md-editor .md-editor-toolbar-item {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 6px !important;
}

.md-editor .md-editor-toolbar-item svg,
.md-editor .md-editor-toolbar-item .md-editor-icon {
  width: 24px !important;
  height: 24px !important;
}

.md-editor .md-editor-content {
  height: calc(100% - 56px) !important;
}

.doc-md-preview {
  background: transparent;
}
</style>
