<script setup lang="ts">
import DialogTemplate from '../../dialog/DialogTemplate.vue'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { regenerateAgentKey } from '@/api/v1/agentsApi'
import { useAgentsQuery } from '@/composables/useAgentsQuery'
import { useLayoutStore } from '@/stores/layout'
import BaseButton from '@/components/base/BaseButton.vue'
import type { Agent } from '@/types/agentTypes'

const props = defineProps<{ task?: Agent }>()

const { t } = useI18n()
const layoutStore = useLayoutStore()
const agentsQuery = useAgentsQuery()

const loading = ref(false)
const result = ref<{ apiKey: string } | null>(null)
const error = ref('')

const agentId = computed(() => props.task?.id)
const canRegenerate = computed(() => Boolean(agentId.value) && !loading.value && !result.value)

function apiErr(e: unknown, fallback: string): string {
  const d = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return d?.message || d?.error || (e as Error).message || fallback
}

async function copyKey() {
  if (!result.value?.apiKey) return
  try {
    await navigator.clipboard.writeText(result.value.apiKey)
    layoutStore.openToast({ message: t('actions.copied'), type: 'success' })
  } catch {
    layoutStore.openToast({ message: t('settingsApp.agents.copyFailed'), type: 'error' })
  }
}

function close() {
  if (result.value) {
    agentsQuery.refetch()
  }
  layoutStore.closeDialog()
}

async function submit() {
  const id = agentId.value
  if (!id || !canRegenerate.value) return
  error.value = ''
  loading.value = true
  try {
    const res = await regenerateAgentKey(id)
    result.value = { apiKey: res.apiKey }
    layoutStore.openToast({ message: t('settingsApp.agents.regenerateSuccess'), type: 'success' })
  } catch (e: unknown) {
    error.value = apiErr(e, t('settingsApp.agents.regenerateError'))
    layoutStore.openToast({ message: error.value, type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <DialogTemplate>
    <template #header>
      <span class="text-lg font-bold">{{ $t('settingsApp.agents.regenerateKey') }}</span>
    </template>
    <div class="flex flex-col gap-4">
      <template v-if="!result">
        <p class="text-sm text-base-content/80">{{ $t('settingsApp.agents.regenerateWarning') }}</p>
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
      </template>
      <template v-else>
        <p class="text-sm text-base-content/80">{{ $t('settingsApp.agents.apiKeyCopyHint') }}</p>
        <div class="form-control">
          <label class="label" for="regen-agent-apikey">{{ $t('settingsApp.agents.apiKeyLabel') }}</label>
          <div class="flex gap-2">
            <input
              id="regen-agent-apikey"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              :value="result.apiKey"
              readonly
            />
            <button type="button" class="btn btn-outline btn-sm shrink-0" @click="copyKey">
              {{ $t('actions.copy') }}
            </button>
          </div>
        </div>
      </template>
    </div>
    <template #actions>
      <template v-if="!result">
        <BaseButton :label="$t('actions.close')" class="btn-ghost" @click="close" />
        <BaseButton
          :label="$t('settingsApp.agents.regenerateConfirm')"
          :disabled="!canRegenerate"
          @click="submit"
        />
      </template>
      <template v-else>
        <BaseButton :label="$t('settingsApp.agents.dialogDone')" @click="close" />
      </template>
    </template>
  </DialogTemplate>
</template>
