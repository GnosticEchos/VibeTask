<template>
  <div v-if="visible" class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 pointer-events-none flex justify-center">
    <div :class="['alert', `alert-${type}`, 'pointer-events-auto shadow-lg']">
      <span>{{ message }}</span>
      <button class="btn btn-xs btn-ghost ml-2" @click="close" type="button">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}>()

const visible = ref(true)

function close() {
  visible.value = false
}

watch(
  () => props.message,
  () => {
    visible.value = true
    if ((props.duration ?? 0) > 0) {
      setTimeout(close, props.duration!)
    }
  },
  { immediate: true }
)
</script> 