<script setup lang="ts">
import PermissionNotice from './PermissionNotice.vue'

defineProps<{
  title: string
  subtitle?: string
  mode?: 'editable' | 'read-only' | 'hidden'
  readOnlyText?: string
}>()
</script>

<template>
  <section
    v-if="mode !== 'hidden'"
    class="card border border-base-300/60 bg-base-100 shadow-sm"
    :class="mode === 'read-only' ? 'opacity-90' : ''"
  >
    <div class="card-body gap-3 overflow-visible">
      <header class="flex flex-col gap-1">
        <h3 class="card-title text-lg">{{ title }}</h3>
        <p v-if="subtitle" class="text-sm text-base-content/70">{{ subtitle }}</p>
      </header>

      <PermissionNotice :mode="mode || 'editable'" :read-only-text="readOnlyText" />

      <div class="flex flex-col gap-3">
        <slot />
      </div>

      <footer v-if="$slots.actions" class="card-actions justify-end pt-2">
        <slot name="actions" />
      </footer>
    </div>
  </section>
</template>
