<script setup lang="ts">
export interface Props {
  numOfColumns?: number
}

withDefaults(defineProps<Props>(), {
  numOfColumns: 4,
})
</script>

<template>
  <div class="flex h-full gap-5">
    <div
      v-for="num in numOfColumns"
      :key="num"
      class="flex flex-col"
    >
      <div class="skeleton h-8 w-32 mb-4"></div>
      <div class="skeleton h-24 w-64"></div>
    </div>
  </div>
</template>
