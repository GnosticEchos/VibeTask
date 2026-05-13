<script setup lang="ts">
import { iTab } from '@/types/coreTypes'

defineProps({
  tabs: {
    type: Array as () => iTab[],
    required: true,
  },
  modelValue: {
    type: Number,
    required: true,
  },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div class="btn-group">
    <button
      v-for="(tab, idx) in tabs"
      :key="tab.name"
      :class="[
        'btn',
        idx === modelValue ? 'btn-primary' : 'btn-ghost',
        'rounded-none',
        'border',
        'border-base-200',
        'text-base-content',
        'px-4',
        'py-2',
        'text-sm',
        'font-medium',
        'focus:outline-none',
        'focus-visible:ring-2',
        'transition',
        'min-w-[80px]'
      ]"
      @click="emit('update:modelValue', idx)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

