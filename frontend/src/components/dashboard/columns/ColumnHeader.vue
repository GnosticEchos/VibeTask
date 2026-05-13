<script setup lang="ts">
defineProps({
  column: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="header flex items-center" style="gap: 0.75rem;">
    <div
      class="header__color-circle"
      :style="{ backgroundColor: 'var(--color-primary)' }"
    ></div>
    <div class="flex justify-between flex-grow-1">
      <span v-if="column?.name" class="header__name"
        >{{ column.name }} ({{ column.tasks.length }})</span
      >
      <div v-if="column.description" class="tooltip" :data-tip="column.description">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="inline-block w-4 h-4 stroke-current"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
      </div>
    </div>
  </div>
</template>
