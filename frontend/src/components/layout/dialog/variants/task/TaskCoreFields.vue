<script setup lang="ts">
import {
  TASK_STATUS_ARCHIVE,
  TASK_STATUS_BACKLOG,
  taskStatusFromSelectValue,
  taskStatusToSelectValue,
  type TaskStatusValue,
} from '@/utils/taskStatusAssignment'

type SelectOption = {
  value: string
  label: string
}

type ColumnOption = {
  id: number
  name: string
}

const props = defineProps<{
  name: string
  description: string
  taskStatus: TaskStatusValue
  assigneeId: string
  columnOptions: ColumnOption[]
  assigneeOptions: SelectOption[]
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:description': [value: string]
  'update:taskStatus': [value: TaskStatusValue]
  'update:assigneeId': [value: string]
}>()

function onStatusChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  emit('update:taskStatus', taskStatusFromSelectValue(raw))
}
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="font-semibold">{{ $t('taskDialog.coreDetails') }}</h3>
      <span class="text-xs text-base-content/60">{{ $t('taskDialog.editableFields') }}</span>
    </div>

    <div class="grid gap-3">
      <label class="form-control">
        <span class="label-text font-medium">{{ $t('tasks.name') }}</span>
        <input
          :value="name"
          class="input input-bordered input-sm"
          :aria-label="$t('tasks.name')"
          @input="$emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text font-medium">{{ $t('tasks.status') }}</span>
          <select
            :value="taskStatusToSelectValue(taskStatus)"
            class="select select-bordered select-sm"
            :aria-label="$t('tasks.status')"
            @change="onStatusChange"
          >
            <option :value="TASK_STATUS_BACKLOG">{{ $t('project.backlog') }}</option>
            <option v-for="col in columnOptions" :key="col.id" :value="String(col.id)">
              {{ col.name }}
            </option>
            <option :value="TASK_STATUS_ARCHIVE">{{ $t('project.archive') }}</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text font-medium">{{ $t('tasks.assignee') }}</span>
          <select
            :value="assigneeId"
            class="select select-bordered select-sm"
            :aria-label="$t('tasks.assignee')"
            @change="$emit('update:assigneeId', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ $t('tasks.notAssigned') }}</option>
            <option v-for="assignee in assigneeOptions" :key="assignee.value" :value="assignee.value">
              {{ assignee.label }}
            </option>
          </select>
        </label>
      </div>

      <label class="form-control">
        <span class="label-text font-medium">{{ $t('tasks.description') }}</span>
        <textarea
          :value="description"
          class="textarea textarea-bordered textarea-sm min-h-24"
          :aria-label="$t('tasks.description')"
          @input="$emit('update:description', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
    </div>
  </section>
</template>
