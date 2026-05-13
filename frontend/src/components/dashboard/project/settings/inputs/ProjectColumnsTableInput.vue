<script setup lang="ts">
import usePermittedUser from '@/composables/usePermittedUser'
// import { columnTypes } from '@/const'
import { iUpdateColumn } from '@/types/columnTypes'
import rules from '@/utils/validators'
import { ref, watch } from 'vue'
// import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'

// const { t } = useI18n()
const { isAdmin } = usePermittedUser()

const emit = defineEmits(['update:columns', 'update:aggregated-errors'])

const props = defineProps({
  columns: {
    type: Array as () => iUpdateColumn[],
    default: () => [],
  },
  aggregatedErrors: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isEditingColumns: {
    type: Boolean,
    default: false,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
})

console.log('[ProjectColumnsTableInput] props.columns:', props.columns)

const aggregatedErrors = ref({})

const markColumnToDelete = (index: number) => {
  // Instead of removing the column, mark it for deletion
  // This allows us to send the toDelete flag to the backend
  props.columns[index].toDelete = true;
}

const addNewColumnAfter = (index: number) => {
  // Insert a new column after the given index
  const newColumn = {
    id: null,
    name: '',
    color: '', // default empty string
    type: null, // default null
    description: '',
    order: props.columns.length + 1,
    isNew: true,
  }
  props.columns.splice(index + 1, 0, newColumn)
}

function onColumnsOrderUpdate() {
  // Update the order property of each column based on its position
  props.columns.forEach((col, index) => {
    col.order = index + 1;
  });
  emit('update:columns', [...props.columns])
}

const aggregateError = ({ key, value }: { key: string; value: string }) => {
  const errors = { ...props.aggregatedErrors }
  errors[key] = value
  emit('update:aggregated-errors', { ...errors })
}

watch(
  () => props.errors,
  (newVal: any) => {
    aggregatedErrors.value = { ...newVal }
  }
)
</script>

<template>
  <div class="overflow-x-auto">
    <!-- Debug info -->
    <div class="text-xs mb-2">
      Debug: props.columns.length = {{ props.columns.length }}
      Debug: filtered columns = {{ props.columns.filter(col => !col.toDelete).length }}
    </div>
    <table class="table table-zebra w-full rounded-box bg-base-100 text-base-content">
      <thead>
        <tr>
          <th class="w-12">#</th>
          <th class="w-[320px]">{{ $t('settings.columns.name') }}</th>
          <th class="w-[400px]">{{ $t('settings.columns.description') }}</th>
          <th class="w-24 text-center">{{ $t('settings.columns.actions') }}</th>
        </tr>
      </thead>
      <VueDraggable
        v-model="props.columns"
        tag="tbody"
        :animation="150"
        item-key="id"
        @update="onColumnsOrderUpdate"
      >
        <tr
          v-for="(data, index) in props.columns.filter(col => !col.toDelete)"
          :key="String(data.id ?? index)"
          class="hover:bg-base-200 cursor-pointer"
        >
          <td class="px-6 py-4 text-center">{{ index + 1 }}</td>
          <!-- Name input, longer -->
          <td class="px-6 py-4">
              <BaseInput
              v-model="props.columns[index].name"
                :name="`column-name#${data.id}`"
                :disabled="isEditingColumns && !isAdmin"
                hideDetails
                emitErrors
                validateOnCreate
                @onErrorChange="aggregateError"
                :rules="[(value:string) => rules.required(value,'Name')]"
              class="w-full"
              />
              <!-- Debug info -->
              <div class="text-xs mt-1">
                Debug: data.name = {{ data.name }}
                Debug: index = {{ index }}
              </div>
          </td>
          <!-- Description textarea -->
          <td class="px-6 py-4">
            <textarea
              v-model="props.columns[index].description"
              :name="`column-description#${data.id}`"
              :placeholder="$t('settings.columns.noDescription')"
              maxlength="1000"
              class="textarea textarea-bordered w-full min-h-[120px] h-28"
              :disabled="isLoading || !isAdmin"
            ></textarea>
            <!-- Debug info -->
            <div class="text-xs mt-1">
              Debug: data.description = {{ data.description }}
            </div>
          </td>
          <!-- Actions: Plus and Trash can with tooltips -->
          <td class="px-6 py-4 text-center flex gap-2 justify-center items-center">
            <!-- Add new column after this row -->
            <div class="tooltip tooltip-left z-50" data-tip="Add new column">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                    :disabled="isLoading || !isAdmin"
                @click="addNewColumnAfter(index)"
                aria-label="Add new column"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <!-- Remove column -->
            <div class="tooltip tooltip-left z-50" data-tip="Remove column (any data in column will be moved to the backlog)">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="isLoading || !isAdmin"
                @click="markColumnToDelete(index)"
                aria-label="Delete column"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="!props.columns.filter(col => !col.toDelete).length">
          <td :colspan="4" class="px-6 py-4 text-center text-gray-500">
            {{ $t('settings.columns.noColumns') }}
          </td>
        </tr>
      </VueDraggable>
    </table>
  </div>
</template>