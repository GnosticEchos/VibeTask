<script setup lang="ts">
defineProps<{
  mode: 'editable' | 'read-only' | 'hidden'
  readOnlyText?: string
}>()
</script>

<template>
  <div
    v-if="mode === 'read-only'"
    class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80"
  >
    <span>{{ readOnlyText || $t('settingsHub.permissions.readOnly') }}</span>
  </div>
</template>
