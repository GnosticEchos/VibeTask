<script setup lang="ts">
import { relations } from '@/const'
import { useTasksStore } from '@/stores/tasks'
import { iSimplifiedTask, iTask } from '@/types/taskTypes'
import { trimText } from '@/utils/functions'
import rules from '@/utils/validators'
import { Form } from 'vee-validate'
import { computed, PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { FwbTooltip } from 'flowbite-vue'

const emit = defineEmits([
  'setEditingState',
  'updateRelation',
  'updateValue',
  'deleteRelation',
  'openRelatedTaskDialog',
])

const props = defineProps({
  taskHasRelation: {
    type: Boolean,
    default: false,
  },
  relationId: {
    type: Number as PropType<number | null>,
    default: null,
  },
  relationMode: {
    type: String as PropType<string | null>,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
  dialogItem: {
    type: Object,
    default: () => ({}),
  },
  task: {
    type: Object as () => iTask,
    default: () => ({}),
  },
  relatedTask: {
    type: Object as () => iSimplifiedTask | null,
    default: () => ({}),
  },
})

const { t } = useI18n()
const tasksStore = useTasksStore()

const relatedTasksOptions = computed(() => {
  return tasksStore.items
    .filter((item) => item.id !== props.task.id)
    ?.sort((a, b) => a.id - b.id)
    ?.map((task) => {
      const assiggnee = task.assignee?.fullName
        ? ` - ${task.assignee?.fullName || ''}`
        : ''
      return {
        label: `${task.identifier}: ${trimText(task.name, 15)} ${trimText(
          assiggnee,
          15,
        )}`,
        id: task.id,
      }
    })
})

const loading = computed(() => tasksStore.loadingItems ?? tasksStore.loadingItem ?? false)

const setRelationEditingState = () => {
  if (props.isEditing) {
    emit('updateValue', { key: 'relationMode', value: '' })
    emit('updateValue', { key: 'relationId', value: null })
    emit('setEditingState', { key: 'relation', value: false })
  } else {
    emit('setEditingState', { key: 'relation', value: true })
  }
}

const translateRelation = (relationName: string, fallbackName: string = '') => {
  return relationName
    ? t(`relations.${relationName.toLowerCase().replace(' ', '_')}`)
    : fallbackName
}
</script>

<template>
  <div class="flex justify-between items-center p-2 mt-2">
    <span class="label">{{ $t('tasks.connectedTask') }}</span>
    <button
      v-if="!taskHasRelation || (!taskHasRelation && !disabled)"
      type="button"
      class="btn btn-ghost btn-xs p-1 cursor-pointer"
      aria-label="Toggle relation"
      @click="setRelationEditingState"
    >
      <svg v-if="!isEditing" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  </div>

  <Form v-if="isEditing" v-slot="{ resetField, errors }">
    <div class="flex gap-2 px-2 mt-1">
      <div
        class="flex flex-col justify-center"
        :style="{ width: '140px !important' }"
      >
        <BaseSelect
          :value="relationMode"
          :items="relations"
          name="relationMode"
          :placeholder="$t('tasks.type')"
          :hide-dropdown-icon="true"
          :rules="[(value:string) => relationId ? rules.required(value,$t('tasks.relation')) : true]"
          @cleared="!relationId ? resetField('relatedTaskField') : null"
          @update:modelValue="(value:number) => $emit('updateValue', { key: 'relationMode', value })"
        >
          <template #value="{ slotProps }">
            {{ translateRelation(slotProps.value, $t('tasks.type')) }}</template
          >
          <template #option="{ slotProps }">
            {{
              translateRelation(slotProps.option, $t('tasks.type'))
            }}</template
          >
        </BaseSelect>
      </div>
      <div
        class="flex flex-col flex-1 justify-center"
        style="max-width: 355px; min-width: 355px; width: 355px"
      >
        <BaseSelect
          :value="relationId"
          :items="relatedTasksOptions"
          name="relatedTask"
          optionsValue="id"
          optionsLabel="label"
          :disabled="loading"
          :placeholder="
            $t('tasks.selectXtask', {
              type: relationMode ? `'${translateRelation(relationMode as string).toLowerCase()}'` : '',
            })
          "
          :rules="[(value:string) => relationMode ? rules.required(value,$t('tasks.relatedTask')) : true]"
          @cleared="!relationMode ? resetField('relationModeField') : null"
          @update:modelValue="(value:number) => $emit('updateValue', { key: 'relationId', value })"
        />
      </div>
      <div class="flex justify-center">
        <BaseButton
          icon="check"
          medium
          :disabled="
            Object.keys(errors).length > 0 || !relationId || !relationMode
          "
          @click="$emit('updateRelation')"
        />
      </div>
    </div>
  </Form>

  <div
    v-if="task.relatedTask?.id"
    class="field-hover relation flex justify-between items-center p-2 ml-2"
    @click="
      $emit('openRelatedTaskDialog', {
        taskId: task.relatedTask.id,
        redirected: true,
      })
    "
  >
    <span>{{
      translateRelation(task.relatedTask.relationMode as string)
    }}</span>
    <div class="flex items-center justify-center">
      <span class="mr-2">{{ relatedTask?.identifier }} / </span>
      <FwbTooltip :content="relatedTask?.name">
        <span class="mr-2">{{
          trimText(relatedTask?.name, 20)
        }}</span>
      </FwbTooltip>
      <span>{{ trimText(relatedTask?.assignee?.fullName, 20) }}</span>
      <FwbTooltip :content="$t('tasks.deleteRelation')">
        <button
          v-if="!disabled"
          type="button"
          class="btn btn-ghost btn-xs p-1 ml-2"
          aria-label="Delete relation"
          @click.stop="$emit('deleteRelation')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </FwbTooltip>
    </div>
  </div>
</template>

