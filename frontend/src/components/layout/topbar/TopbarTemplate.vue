<script setup lang="ts">
const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="flex justify-between items-center w-full">
    <div class="flex items-center">
      <div
        v-if="$slots.title"
        class="topbar__title text-xl font-semibold text-base-content select-none"
        :style="{ width: $slots.left ? '250px' : 'auto' }"
      >
        <span v-if="props.loading" class="skeleton h-6 w-48 block" aria-busy="true"></span>
        <slot v-else name="title"></slot>
      </div>
      <slot name="left"></slot>
    </div>
    <div class="flex items-center">
      <slot name="right"></slot>
    </div>
  </div>
</template>
