<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import usePermittedUser from '@/composables/usePermittedUser'
import BaseInput from '@/components/base/BaseInput.vue'
import type { iUpdateColumn } from '@/types/columnTypes'
import rules from '@/utils/validators'

const { t } = useI18n()
const { isAdmin } = usePermittedUser()

const props = defineProps({
  columns: {
    type: Array as () => iUpdateColumn[],
    default: () => [],
  },
  aggregatedErrors: {
    type: Object as () => Record<string, string | undefined>,
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
    type: Object as () => Record<string, string | undefined>,
    default: () => ({}),
  },
})

const emit = defineEmits<{
  'update:columns': [columns: iUpdateColumn[]]
  'update:aggregated-errors': [errors: Record<string, string | undefined>]
}>()

const localAggregatedErrors = ref<Record<string, string | undefined>>({})

const visibleColumns = computed(() => props.columns.filter((col) => !col.toDelete))

function columnRowKey(col: iUpdateColumn, index: number): string {
  if (col.id != null) return `col-${col.id}`
  return `col-new-${col.order ?? index}`
}

function emitColumns(next: iUpdateColumn[]) {
  emit('update:columns', next)
}

function resolveColumnIndex(col: iUpdateColumn): number {
  return props.columns.findIndex(
    (c) =>
      c === col ||
      (col.id != null && c.id === col.id) ||
      (col.isNew && c.isNew && c.order === col.order),
  )
}

function onVisibleColumnsReorder(nextVisible: iUpdateColumn[]) {
  nextVisible.forEach((col, index) => {
    col.order = index + 1
  })
  const deleted = props.columns.filter((col) => col.toDelete)
  emitColumns([...nextVisible, ...deleted])
}

const markColumnToDelete = (col: iUpdateColumn) => {
  col.toDelete = true
  const updated = [...props.columns]
  let nextOrder = 1
  for (const c of updated) {
    if (!c.toDelete) c.order = nextOrder++
  }
  emitColumns(updated)
}

const addNewColumnAfter = (col: iUpdateColumn) => {
  const index = resolveColumnIndex(col)
  const insertAt = index >= 0 ? index + 1 : props.columns.length
  const newColumn: iUpdateColumn = {
    id: null,
    name: '',
    color: '#6366f1',
    type: null,
    description: '',
    order: insertAt + 1,
    isNew: true,
  }
  const updated = [...props.columns]
  updated.splice(insertAt, 0, newColumn)
  let nextOrder = 1
  for (const c of updated) {
    if (!c.toDelete) c.order = nextOrder++
  }
  emitColumns(updated)
}

const aggregateError = ({ key, value }: { key: string; value: string }) => {
  const errors = { ...props.aggregatedErrors, [key]: value }
  emit('update:aggregated-errors', errors)
}

watch(
  () => props.errors,
  (newVal) => {
    localAggregatedErrors.value = { ...newVal }
  },
  { immediate: true },
)
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table table-zebra w-full rounded-box bg-base-100 text-base-content">
      <thead>
        <tr>
          <th class="w-12">#</th>
          <th class="w-[min(320px,35%)]">{{ t('settings.columns.name') }}</th>
          <th>{{ t('settings.columns.description') }}</th>
          <th class="w-24 text-center">{{ t('settings.columns.actions') }}</th>
        </tr>
      </thead>
      <VueDraggable
        :model-value="visibleColumns"
        tag="tbody"
        :animation="150"
        handle=".drag-handle"
        :item-key="(col: iUpdateColumn) => columnRowKey(col, col.order ?? 0)"
        @update:model-value="onVisibleColumnsReorder"
      >
        <tr
          v-for="(col, visibleIndex) in visibleColumns"
          :key="columnRowKey(col, visibleIndex)"
          class="hover:bg-base-200/50"
        >
          <td class="align-top text-center">
            <span class="drag-handle cursor-grab select-none text-base-content/50" title="Drag to reorder">⋮⋮</span>
            <span class="ml-1 tabular-nums">{{ visibleIndex + 1 }}</span>
          </td>
          <td class="align-top">
            <BaseInput
              v-model="col.name"
              :name="`column-name#${col.id ?? col.order}`"
              :disabled="isEditingColumns && !isAdmin"
              hide-details
              emit-errors
              validate-on-create
              :rules="[(value: string) => rules.required(value, 'Name')]"
              class="w-full"
              @on-error-change="aggregateError"
            />
          </td>
          <td class="align-top">
            <textarea
              v-model="col.description"
              :name="`column-description#${col.id ?? col.order}`"
              :placeholder="t('settings.columns.noDescription')"
              maxlength="200"
              class="textarea textarea-bordered textarea-sm w-full min-h-[4.5rem]"
              :disabled="isLoading || (isEditingColumns && !isAdmin)"
            />
          </td>
          <td class="align-top">
            <div class="flex justify-center gap-1">
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :disabled="isLoading || (isEditingColumns && !isAdmin)"
                title="Add column below"
                @click="addNewColumnAfter(col)"
              >
                +
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square text-error"
                :disabled="isLoading || (isEditingColumns && !isAdmin)"
                title="Remove column"
                @click="markColumnToDelete(col)"
              >
                ×
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="visibleColumns.length === 0">
          <td colspan="4" class="py-4 text-center text-base-content/60">
            {{ t('settings.columns.noColumns') }}
          </td>
        </tr>
      </VueDraggable>
    </table>
  </div>
</template>
