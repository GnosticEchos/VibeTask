<script setup lang="ts">
import WorkspaceMembersCard from '@/components/settings/workspace/WorkspaceMembersCard.vue'
import { useProjectStore } from '@/stores/project'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { isValidId } from '@/utils/validation'

const emit = defineEmits<{ close: [] }>()

const projectStore = useProjectStore()

const projectId = computed(() =>
  Number(projectStore.selectedProjectId || projectStore.project?.id || 0),
)

function onClose() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="kanban-modal relative max-h-[min(85vh,36rem)] overflow-y-auto overscroll-y-contain pr-1 pt-10 [scrollbar-gutter:stable]">
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-circle absolute right-0 top-0 z-10"
      :aria-label="$t('actions.close')"
      @click="onClose"
    >
      ✕
    </button>
    <WorkspaceMembersCard v-if="isValidId(projectId)" :project-id="projectId" />
    <div v-else class="alert alert-warning text-sm">
      {{ $t('settingsHub.workspace.noProjectSelected') }}
    </div>
  </div>
</template>
