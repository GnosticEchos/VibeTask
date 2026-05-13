<script setup lang="ts">
import BaseSelect from '@/components/base/BaseSelect.vue'

type RelationOption = {
  label: string
  value: string
}

type RelatedTaskOption = {
  id: number
  displayLabel: string
}

defineProps<{
  relationType: string
  relatedTaskId: string
  relationOptions: RelationOption[]
  relatedTasks: RelatedTaskOption[]
}>()

defineEmits<{
  'update:relationType': [value: string]
  'update:relatedTaskId': [value: string]
}>()
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-4">
    <div class="mb-3">
      <h3 class="font-semibold">{{ $t('taskDialog.relationships') }}</h3>
      <p class="text-xs text-base-content/60">{{ $t('taskDialog.relationshipsHint') }}</p>
    </div>

    <div class="grid gap-2 md:grid-cols-2">
      <BaseSelect
        :model-value="relationType"
        name="relationType"
        :items="relationOptions"
        optionsLabel="label"
        optionsValue="value"
        :placeholder="$t('tasks.relationType')"
        @update:model-value="$emit('update:relationType', String($event || ''))"
      />
      <BaseSelect
        :model-value="relatedTaskId"
        name="relatedTaskId"
        :items="relatedTasks"
        optionsLabel="displayLabel"
        optionsValue="id"
        :placeholder="$t('tasks.relatedTask')"
        :disabled="!relatedTasks.length"
        @update:model-value="$emit('update:relatedTaskId', String($event || ''))"
      />
    </div>
  </section>
</template>
