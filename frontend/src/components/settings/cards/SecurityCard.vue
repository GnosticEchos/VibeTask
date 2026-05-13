<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'
import api from '@/api/v1/indexApi'
import { useLayoutStore } from '@/stores/layout'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    mode?: SettingsCardMode
  }>(),
  {
    mode: 'read-only',
  },
)

const { t } = useI18n()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)

const editable = computed(() => props.mode === 'editable')
const hasMinLength = computed(() => newPassword.value.length >= 8)
const matchesConfirm = computed(() => newPassword.value === confirmPassword.value)
const canSubmitPassword = computed(
  () =>
    editable.value &&
    !changingPassword.value &&
    currentPassword.value.length > 0 &&
    hasMinLength.value &&
    matchesConfirm.value,
)

function resetPasswordForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

async function submitPasswordChange() {
  if (!canSubmitPassword.value) return
  try {
    changingPassword.value = true
    await api.changeCurrentUserPassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    resetPasswordForm()
    layoutStore.openToast({
      type: 'success',
      message: t('settingsHub.account.security.passwordChanged'),
    })
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.security.passwordChangeError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.account.security.title')"
    :subtitle="$t('settingsHub.account.security.subtitle')"
    :mode="props.mode"
  >
    <p class="text-sm text-base-content/70">
      {{ editable ? $t('settingsHub.account.security.passwordHelp') : $t('settingsHub.account.security.body') }}
    </p>

    <form class="mt-2 flex flex-col gap-3" @submit.prevent="submitPasswordChange">
      <input
        type="text"
        class="hidden"
        tabindex="-1"
        aria-hidden="true"
        autocomplete="username"
        :value="authStore.user?.email || ''"
        readonly
      />
      <label class="form-control">
        <span class="label-text">{{ $t('settingsHub.account.security.currentPassword') }}</span>
        <input
          v-model="currentPassword"
          type="password"
          class="input input-bordered"
          :readonly="!editable"
          :disabled="!editable || changingPassword"
          autocomplete="current-password"
        />
      </label>

      <label class="form-control">
        <span class="label-text">{{ $t('settingsHub.account.security.newPassword') }}</span>
        <input
          v-model="newPassword"
          type="password"
          class="input input-bordered"
          :readonly="!editable"
          :disabled="!editable || changingPassword"
          autocomplete="new-password"
        />
      </label>

      <label class="form-control">
        <span class="label-text">{{ $t('settingsHub.account.security.confirmPassword') }}</span>
        <input
          v-model="confirmPassword"
          type="password"
          class="input input-bordered"
          :readonly="!editable"
          :disabled="!editable || changingPassword"
          autocomplete="new-password"
        />
      </label>

      <div v-if="editable && !hasMinLength" class="text-xs text-base-content/70">
        {{ $t('settingsHub.account.security.passwordMin') }}
      </div>
      <div v-if="editable && hasMinLength && !matchesConfirm" class="text-xs text-error">
        {{ $t('settingsHub.account.security.passwordMismatch') }}
      </div>

      <div class="mt-1 flex flex-wrap gap-2">
        <button type="submit" class="btn btn-outline" :disabled="!canSubmitPassword">
          {{
            changingPassword ? $t('settingsHub.account.security.changing') : $t('settingsHub.account.security.changePassword')
          }}
        </button>
        <button type="button" class="btn btn-ghost" :disabled="changingPassword" @click="resetPasswordForm">
          {{ $t('settingsHub.account.security.reset') }}
        </button>
        <button type="button" class="btn btn-ghost" disabled>
          {{ $t('settingsHub.account.security.twoFactor') }}
        </button>
      </div>
    </form>

    <template #actions>
      <span class="text-xs text-base-content/60">{{ $t('settingsHub.account.security.twoFactorComingSoon') }}</span>
    </template>
  </SettingsCard>
</template>
