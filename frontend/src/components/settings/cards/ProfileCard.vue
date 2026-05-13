<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getDisplayName } from '@/utils/functions'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'
import api from '@/api/v1/indexApi'
import { useLayoutStore } from '@/stores/layout'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  mode: SettingsCardMode
}>()

const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const { t } = useI18n()
const user = computed(() => authStore.user)
const displayName = computed(() => getDisplayName(user.value))
const editable = computed(() => props.mode === 'editable')
const avatarInitial = computed(() => {
  const n = user.value?.name?.[0] ?? user.value?.fullName?.[0]
  return n ? String(n).toUpperCase() : '?'
})
const formName = ref('')
const formAvatarUrl = ref('')
const saving = ref(false)

watch(
  () => user.value,
  (nextUser) => {
    formName.value = nextUser?.name || nextUser?.fullName || ''
    formAvatarUrl.value = nextUser?.avatarUrl || ''
  },
  { immediate: true },
)

const canSave = computed(() => {
  if (!editable.value || saving.value) return false
  const trimmedName = formName.value.trim()
  return trimmedName.length > 0 && trimmedName.length <= 100
})

async function submitProfileUpdate() {
  if (!canSave.value) return
  const trimmedName = formName.value.trim()
  const trimmedAvatar = formAvatarUrl.value.trim()

  try {
    saving.value = true
    const response = await api.updateCurrentUser({
      name: trimmedName,
      avatarUrl: trimmedAvatar ? trimmedAvatar : null,
    })
    authStore.setUser(response.user)
    layoutStore.openToast({
      type: 'success',
      message: t('settingsApp.account.profileSaved'),
    })
  } catch (err: any) {
    const fallback = 'Failed to update profile.'
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      fallback
    layoutStore.openToast({ type: 'error', message })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.account.profile.title')"
    :subtitle="$t('settingsHub.account.profile.subtitle')"
    :mode="props.mode"
  >
    <div class="flex flex-col sm:flex-row gap-4 items-start">
      <div class="avatar shrink-0">
        <div class="rounded-full w-16 h-16" :class="{ 'bg-neutral text-neutral-content placeholder': !user.avatarUrl }">
          <img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="displayName" class="rounded-full w-16 h-16 object-cover" />
          <span v-else class="text-2xl">{{ avatarInitial }}</span>
        </div>
      </div>
      <form class="flex flex-col gap-4 flex-1 w-full" @submit.prevent="submitProfileUpdate">
        <div class="form-control">
          <label class="label" for="account-name">{{ $t('settingsApp.account.name') }}</label>
          <input
            id="account-name"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'bg-base-200 read-only:outline-none read-only:border-base-300': !editable }"
            v-model="formName"
            :readonly="!editable"
            :aria-readonly="!editable ? 'true' : 'false'"
            maxlength="100"
          />
        </div>
        <div class="form-control">
          <label class="label" for="account-avatar">{{ $t('settingsApp.account.avatarUrl') }}</label>
          <input
            id="account-avatar"
            type="url"
            class="input input-bordered w-full"
            :class="{ 'bg-base-200 read-only:outline-none read-only:border-base-300': !editable }"
            v-model="formAvatarUrl"
            :readonly="!editable"
            :aria-readonly="!editable ? 'true' : 'false'"
            :placeholder="$t('settingsApp.account.avatarUrlPlaceholder')"
          />
        </div>
        <div class="form-control">
          <label class="label" for="account-email">{{ $t('settingsApp.account.email') }}</label>
          <input
            id="account-email"
            type="email"
            class="input input-bordered w-full bg-base-200 read-only:outline-none read-only:border-base-300"
            :value="user.email || ''"
            readonly
            aria-readonly="true"
          />
        </div>
      </form>
    </div>
    <template #actions>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!canSave"
        :title="!editable ? $t('settingsApp.account.saveDisabledHint') : undefined"
        @click="submitProfileUpdate"
      >
        {{ saving ? $t('settingsApp.account.saving') : $t('settingsApp.account.saveChanges') }}
      </button>
    </template>
  </SettingsCard>
</template>
