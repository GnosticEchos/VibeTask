<script setup lang="ts">
import DialogTemplate from '../../dialog/DialogTemplate.vue'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createAgent } from '@/api/v1/agentsApi'
import { useAgentsQuery } from '@/composables/useAgentsQuery'
import { useLayoutStore } from '@/stores/layout'
import BaseButton from '@/components/base/BaseButton.vue'
import AgentAvatarPicker from '@/components/settings/agents/AgentAvatarPicker.vue'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const agentsQuery = useAgentsQuery()

const name = ref('')
const description = ref('')
const avatarSlug = ref<string | undefined>(undefined)
const loading = ref(false)
const created = ref<{ apiKey: string } | null>(null)
const error = ref('')

const canSubmit = computed(() => (name.value?.trim()?.length ?? 0) > 0 && !loading.value)

async function copyKey() {
  if (!created.value?.apiKey) return
  try {
    await navigator.clipboard.writeText(created.value.apiKey)
    layoutStore.openToast({ message: t('actions.copied'), type: 'success' })
  } catch {
    layoutStore.openToast({ message: 'Copy failed', type: 'error' })
  }
}

function close() {
  if (created.value) {
    agentsQuery.refetch()
  }
  name.value = ''
  description.value = ''
  avatarSlug.value = undefined
  created.value = null
  error.value = ''
  layoutStore.closeDialog()
}

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  loading.value = true
  try {
    const result = await createAgent({
      name: name.value.trim(),
      description: description.value?.trim() || undefined,
      avatarSlug: avatarSlug.value,
    })
    created.value = { apiKey: result.apiKey }
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    error.value = msg || (e as Error).message || t('settingsApp.agents.loadError')
    layoutStore.openToast({ message: error.value, type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <DialogTemplate>
    <template #header>
      <span class="text-lg font-bold">{{ $t('settingsApp.agents.createAgent') }}</span>
    </template>
    <div class="flex flex-col gap-4">
      <template v-if="!created">
        <div class="form-control">
          <label class="label" for="create-agent-name">{{ $t('settingsApp.agents.dialogName') }}</label>
          <input
            id="create-agent-name"
            v-model="name"
            type="text"
            class="input input-bordered w-full"
            :disabled="loading"
            :placeholder="$t('settingsApp.agents.dialogName')"
          />
        </div>
        <div class="form-control">
          <label class="label" for="create-agent-desc">{{ $t('settingsApp.agents.dialogDescription') }}</label>
          <input
            id="create-agent-desc"
            v-model="description"
            type="text"
            class="input input-bordered w-full"
            :disabled="loading"
          />
        </div>
        <AgentAvatarPicker v-model="avatarSlug" :disabled="loading" />
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
      </template>
      <template v-else>
        <p class="text-sm text-base-content/80">{{ $t('settingsApp.agents.apiKeyCopyHint') }}</p>
        <div class="form-control">
          <label class="label" for="create-agent-apikey">{{ $t('settingsApp.agents.apiKeyLabel') }}</label>
          <div class="flex gap-2">
            <input
              id="create-agent-apikey"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              :value="created.apiKey"
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
      <template v-if="!created">
        <BaseButton :label="$t('actions.close')" class="btn-ghost" @click="close" />
        <BaseButton
          :label="$t('settingsApp.agents.dialogSubmit')"
          :disabled="!canSubmit || loading"
          @click="submit"
        />
      </template>
      <template v-else>
        <BaseButton :label="$t('settingsApp.agents.dialogDone')" @click="close" />
      </template>
    </template>
  </DialogTemplate>
</template>
