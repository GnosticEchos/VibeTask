<script setup lang="ts">
import { useLayoutStore } from '../../../stores/layout'
import { computed, defineAsyncComponent } from 'vue'
import type { iTask } from '@/types/taskTypes'

// Quick fix: Define ModalSize type for compatibility
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | undefined;

const layoutStore = useLayoutStore()
const dialogData = computed(() => layoutStore.dialog || {})

const dialogComponent = computed(() => {
  const componentName = dialogData.value?.component
  if (componentName) {
    return defineAsyncComponent(() => import(`./variants/${componentName}.vue`))
  }
  return null
})

const backdropOpacity = computed(() => {
  // If dialogData.value.backdropOpacity is set, use it, else default to 0.7
  return typeof dialogData.value.backdropOpacity === 'number' ? dialogData.value.backdropOpacity : 0.7
})

function closeModal() {
  layoutStore.closeDialog()
}

function onDialogSave(_updatedTask: iTask) {
  // TODO: Implement optimistic UI update and API call here
}
</script>

<template>
  <div
    v-if="dialogData.isActive"
    class="modal modal-open fixed inset-0 flex items-center justify-center z-50"
  >
    <div class="modal-box shadow-lg rounded-lg relative" :style="dialogData.size ? { maxWidth: dialogData.size } : undefined">
      <component :is="dialogComponent" @close="closeModal" @save="onDialogSave" :backdrop-opacity="backdropOpacity" :task="dialogData.item" :open="dialogData.isActive" />
    </div>
    <div class="modal-backdrop" @click="closeModal" :style="{ background: `rgba(0,0,0,${backdropOpacity})` }"></div>
  </div>
</template>

<style scoped>
.modal-box {
  max-width: 32rem;

  --tw-bg-opacity: 1;

  background-color: var(--color-base-100);
  padding: 1.5rem;
  border-radius: var(--rounded-box, 1rem);
  box-shadow: var(--shadow-lg);
}
</style>
