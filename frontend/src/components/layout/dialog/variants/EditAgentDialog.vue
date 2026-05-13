<script setup lang="ts">
import DialogTemplate from '../../dialog/DialogTemplate.vue'
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { updateAgent } from '@/api/v1/agentsApi'
import { useAgentsQuery } from '@/composables/useAgentsQuery'
import { useLayoutStore } from '@/stores/layout'
import BaseButton from '@/components/base/BaseButton.vue'
import AgentAvatarPicker from '@/components/settings/agents/AgentAvatarPicker.vue'
import type { Agent } from '@/types/agentTypes'
import { parseAgentMetadata } from '@/utils/agentMetadata'

const props = defineProps<{ task?: Agent }>()

const { t } = useI18n()
const layoutStore = useLayoutStore()
const agentsQuery = useAgentsQuery()

const name = ref('')
const description = ref('')
const avatarSlug = ref<string | undefined>(undefined)
const isActive = ref(true)
const loading = ref(false)
const error = ref('')

watch(
  () => props.task,
  (a) => {
    error.value = ''
    if (a) {
      name.value = a.name ?? ''
      const meta = parseAgentMetadata(a)
      const desc = meta.description
      description.value = typeof desc === 'string' ? desc : desc != null ? String(desc) : ''
      const slug = meta.avatarSlug
      if (slug == null) avatarSlug.value = undefined
      else {
        const s = typeof slug === 'string' ? slug : String(slug)
        avatarSlug.value = s.trim() ? s : undefined
      }
      isActive.value = a.isActive !== false
    }
  },
  { immediate: true },
)

const canSubmit = computed(
  () => (name.value?.trim()?.length ?? 0) > 0 && props.task?.id && !loading.value,
)

function apiErr(e: unknown, fallback: string): string {
  const d = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return d?.message || d?.error || (e as Error).message || fallback
}

function close() {
  layoutStore.closeDialog()
}

async function submit() {
  const id = props.task?.id
  if (!id || !canSubmit.value) return
  error.value = ''
  loading.value = true
  try {
    await updateAgent(id, {
      name: name.value.trim(),
      description: description.value?.trim() || undefined,
      isActive: isActive.value,
      avatarSlug: avatarSlug.value ?? '',
    })
    await agentsQuery.refetch()
    layoutStore.openToast({ message: t('settingsApp.agents.updateSuccess'), type: 'success' })
    close()
  } catch (e: unknown) {
    error.value = apiErr(e, t('settingsApp.agents.updateError'))
    layoutStore.openToast({ message: error.value, type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <DialogTemplate>
    <template #header>
      <span class="text-lg font-bold">{{ $t('settingsApp.agents.editAgent') }}</span>
    </template>
    <div class="flex flex-col gap-4">
      <div class="form-control">
        <label class="label" for="edit-agent-name">{{ $t('settingsApp.agents.dialogName') }}</label>
        <input
          id="edit-agent-name"
          v-model="name"
          type="text"
          class="input input-bordered w-full"
          :disabled="loading"
        />
      </div>
      <div class="form-control">
        <label class="label" for="edit-agent-desc">{{ $t('settingsApp.agents.dialogDescription') }}</label>
        <input
          id="edit-agent-desc"
          v-model="description"
          type="text"
          class="input input-bordered w-full"
          :disabled="loading"
        />
      </div>
      <AgentAvatarPicker v-model="avatarSlug" :disabled="loading" />
      <label class="label cursor-pointer justify-start gap-3">
        <input v-model="isActive" type="checkbox" class="toggle toggle-primary" :disabled="loading" />
        <span class="label-text">{{ $t('settingsApp.agents.agentEnabled') }}</span>
      </label>
      <p v-if="error" class="text-error text-sm">{{ error }}</p>
    </div>
    <template #actions>
      <BaseButton :label="$t('actions.close')" class="btn-ghost" @click="close" />
      <BaseButton
        :label="$t('settingsApp.agents.saveChanges')"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>
  </DialogTemplate>
</template>
