<script setup lang="ts">
import { computed } from 'vue'
import { useColumnsQuery } from '@/composables/useColumnsQuery'
import type { iColumn } from '@/types/columnTypes'

const props = defineProps<{
  projectId: number
  disabled?: boolean
}>()

const mode = defineModel<'FULL' | 'COLUMN_BOUND'>('mode', { required: true })
const restrictedColumnId = defineModel<number | ''>('restrictedColumnId', { required: true })
const allowedMoveRange = defineModel<number>('allowedMoveRange', { required: true })

const columnsQuery = useColumnsQuery(computed(() => props.projectId))
const availableColumns = computed<iColumn[]>(() => {
  const data = columnsQuery.data.value
  return Array.isArray(data) ? data : []
})
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
    <div class="form-control w-full sm:w-40">
      <label class="label py-0">
        <span class="label-text text-xs">{{ $t('settingsApp.agents.delegationMode') }}</span>
      </label>
      <select v-model="mode" class="select select-bordered select-xs w-full" :disabled="disabled">
        <option value="FULL">{{ $t('settingsApp.agents.modeFull') }}</option>
        <option value="COLUMN_BOUND">{{ $t('settingsApp.agents.modeColumnBound') }}</option>
      </select>
    </div>

    <div v-if="mode === 'COLUMN_BOUND'" class="form-control flex-1 min-w-0">
      <label class="label py-0">
        <span class="label-text text-xs">{{ $t('settingsApp.agents.restrictedColumn') }}</span>
      </label>
      <div class="flex gap-2">
        <select
          v-model="restrictedColumnId"
          class="select select-bordered select-xs w-full"
          :disabled="disabled || columnsQuery.isLoading.value"
        >
          <option value="">{{ $t('settingsApp.agents.selectColumn') }}</option>
          <option v-for="c in availableColumns" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
        <span v-if="columnsQuery.isLoading.value" class="loading loading-spinner loading-xs self-center" />
      </div>
    </div>

    <div v-if="mode === 'COLUMN_BOUND'" class="form-control w-full sm:w-28">
      <label class="label py-0">
        <span class="label-text text-xs">{{ $t('settingsApp.agents.moveRange') }}</span>
      </label>
      <select v-model="allowedMoveRange" class="select select-bordered select-xs w-full" :disabled="disabled">
        <option :value="0">{{ $t('settingsApp.agents.moveRangeNone') }}</option>
        <option :value="1">±1</option>
        <option :value="2">±2</option>
      </select>
    </div>
  </div>
</template>
