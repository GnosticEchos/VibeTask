<script setup lang="ts">
import BaseSelect from '@/components/base/BaseSelect.vue'
import { dependencyRelationTypeOptions } from '@/utils/taskRelationMode'

type RelatedTaskOption = {
  id: number
  displayLabel: string
}

defineProps<{
  relationType: string
  relatedTaskId: string
  relatedTasks: RelatedTaskOption[]
  workspaceParentId: string
  workspaceOptions: RelatedTaskOption[]
}>()

const dependencyTypeOptions = dependencyRelationTypeOptions()

const emit = defineEmits<{
  'update:relationType': [value: string]
  'update:relatedTaskId': [value: string]
  'update:workspaceParentId': [value: string]
}>()

function onRelationTypeChange(value: string) {
  emit('update:relationType', value)
  if (!value) {
    emit('update:relatedTaskId', '')
  }
}
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-4">
    <div class="mb-3">
      <h3 class="font-semibold">{{ $t('taskDialog.relationships') }}</h3>
      <p class="text-xs text-base-content/60">{{ $t('taskDialog.relationshipsHint') }}</p>
    </div>

    <div class="space-y-4">
      <div>
        <p class="mb-2 text-xs font-medium text-base-content/70">{{ $t('taskDialog.taskLink') }}</p>
        <div class="grid gap-2 md:grid-cols-2">
          <BaseSelect
            :model-value="relationType"
            name="relationType"
            :items="dependencyTypeOptions"
            optionsLabel="label"
            optionsValue="value"
            :placeholder="$t('tasks.relationType')"
            @update:model-value="onRelationTypeChange(String($event || ''))"
          />
          <BaseSelect
            :model-value="relatedTaskId"
            name="relatedTaskId"
            :items="relatedTasks"
            optionsLabel="displayLabel"
            optionsValue="id"
            :placeholder="$t('tasks.relatedTask')"
            :disabled="!relationType || !relatedTasks.length"
            @update:model-value="$emit('update:relatedTaskId', String($event || ''))"
          />
        </div>
      </div>

      <div>
        <p class="mb-2 text-xs font-medium text-base-content/70">{{ $t('taskDialog.workspaceMembership') }}</p>
        <BaseSelect
          :model-value="workspaceParentId"
          name="workspaceParentId"
          :items="workspaceOptions"
          optionsLabel="displayLabel"
          optionsValue="id"
          :placeholder="$t('taskDialog.workspaceNone')"
          @update:model-value="$emit('update:workspaceParentId', String($event || ''))"
        />
        <p class="mt-1 text-xs text-base-content/50">{{ $t('taskDialog.workspaceMembershipHint') }}</p>
      </div>
    </div>
  </section>
</template>
