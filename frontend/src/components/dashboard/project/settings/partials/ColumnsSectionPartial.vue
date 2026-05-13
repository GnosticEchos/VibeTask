<script setup lang="ts">
import { useLayoutStore } from '../../../../../stores/layout'
import { UpdateColumn, iUpdateColumn } from '../../../../../types/columnTypes'
import { computed, Ref, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { randomPastelColor } from '../../../../../utils/functions'
import ProjectColumnsTableInput from '../inputs/ProjectColumnsTableInput.vue'
import SettingsSectionTemplate from './SettingsSectionTemplate.vue'
import { Form } from 'vee-validate'
import { useProjectMutations } from '../../../../../composables/useProjectMutations'
import { useProjectStore } from '../../../../../stores/project'
import { useColumnsStore } from '../../../../../stores/columns'

const { t } = useI18n()
const layoutStore = useLayoutStore()
useProjectMutations()
const projectStore = useProjectStore()
const columnsStore = useColumnsStore()

// Use columns from Pinia store
const columns = computed(() => projectStore.project.columns || [])
const columnsLocal = ref<iUpdateColumn[]>([])

// Initialize columnsLocal with column data
const initializeColumnsLocal = () => {
  console.log('[ColumnsSectionPartial] initializeColumnsLocal called. Columns from store:', columns.value)
  columnsLocal.value = columns.value.map(col => ({ ...col }))
  console.log('[ColumnsSectionPartial] columnsLocal initialized. Length:', columnsLocal.value.length)
}

// Initialize on component mount
onMounted(() => {
  console.log('[ColumnsSectionPartial] onMounted. Columns from store:', columns.value)
  initializeColumnsLocal()
})

// Watch for changes in the store columns and update local copy
watch(
  columns,
  (newColumns) => {
    console.log('[ColumnsSectionPartial] columns watcher triggered. New columns:', newColumns)
    columnsLocal.value = newColumns.map(col => ({ ...col }))
    console.log('[ColumnsSectionPartial] columnsLocal updated. Length:', columnsLocal.value.length)
  }
)

// Debug watcher for columnsLocal
watch(
  () => columnsLocal.value,
  (newVal) => {
    console.log('[ColumnsSectionPartial] columnsLocal watcher triggered. New value:', newVal)
  }
)

const aggregatedErrors: Ref<Record<string, string | undefined>> = ref({})

const isLoading = ref(false)

const isColumnsSectionValid = computed(() => {
  return (
    Object.values(aggregatedErrors.value).filter((value) => value !== undefined && value !== '')
      .length === 0
  )
})

const isChangeInColumns = computed(() => {
  // Compare current columns with the original columns from the store
  const originalColumns = columns.value.map(col => ({ ...col }))
  return JSON.stringify(originalColumns) !== JSON.stringify(columnsLocal.value)
})

const restoreColumns = () => {
  // Reset to original columns from the store
  columnsLocal.value = columns.value.map(col => ({ ...col }))
  aggregatedErrors.value = {}
};

const addNewColumn = () => {
  const newColumn = new UpdateColumn({
    id: null,
    color: randomPastelColor(),
    order: columnsLocal.value.length + 1,
    name: '',
    type: null,
    description: '',
    isNew: true,
  })
  columnsLocal.value.push(newColumn)
}

const saveColumnsChanges = async () => {
  isLoading.value = true
  try {
    // Use the bulk update method from the columns store
    await columnsStore.bulkUpdateColumns(columnsLocal.value)
    
    // Show success message
    layoutStore.openToast({
      message: t('settings.columns.saveSuccess'),
      type: 'success'
    })
  } catch (err: any) {
    // Show error message
    layoutStore.openToast({
      message: t('settings.columns.saveError') + ': ' + (err.message || ''),
      type: 'error'
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <SettingsSectionTemplate :loading="isLoading">
    <template #header>
      <div class="flex justify-between items-center w-full">
        <span class="title">{{ $t('settings.columns.title') }}</span>
        <div class="flex gap-2">
          <BaseButton
            :label="$t('settings.columns.restore')"
            icon="arrow-path"
            :disabled="isLoading || !isChangeInColumns"
            @click="restoreColumns"
          />
          <BaseButton
            :label="$t('settings.columns.save')"
            icon="check"
            :disabled="isLoading || !isChangeInColumns || !isColumnsSectionValid"
            @click="saveColumnsChanges"
          />
        </div>
      </div>
    </template>
    <template #content>
      <Form v-slot="{ /* errors: formErrors */ }">
        <ProjectColumnsTableInput
          :columns="columnsLocal"
          :aggregated-errors="aggregatedErrors"
          @update:columns="columnsLocal = $event"
          @update:aggregated-errors="aggregatedErrors = $event"
          isEditingColumns
        />
        <!-- Debug info -->
        <div class="text-xs mt-2">
          Debug: columnsLocal.length = {{ columnsLocal.length }}
        </div>
        <div class="flex justify-end mt-4">
          <BaseButton
            :label="$t('settings.columns.addColumn')"
            icon="plus"
            :disabled="isLoading"
            @click="addNewColumn"
          />
        </div>
      </Form>
    </template>
  </SettingsSectionTemplate>
</template>
