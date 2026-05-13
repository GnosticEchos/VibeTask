<script setup lang="ts">

defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="section">
    <div
      v-if="$slots.header"
      class="header flex items-center justify-between"
    >
      <slot name="header"></slot>
    </div>
    <div v-if="$slots.subHeader" class="sub-header px-4 py-2">
      <slot name="subHeader"></slot>
    </div>
    <div v-if="$slots.content" class="content flex flex-col">
      <slot name="content"></slot>
    </div>
    <div style="height: 3px">
      <div v-if="loading" class="skeleton h-full w-full"></div>
    </div>
  </div>
</template>
