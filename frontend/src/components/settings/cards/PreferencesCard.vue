<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'
import api from '@/api/v1/indexApi'
import { useLayoutStore } from '@/stores/layout'

const props = withDefaults(
  defineProps<{
    mode?: SettingsCardMode
  }>(),
  {
    mode: 'read-only',
  },
)

const { t, locale } = useI18n()
const layoutStore = useLayoutStore()
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  locale: 'en',
  timezone: 'UTC',
  taskAssigned: true,
  taskCommented: true,
  dailyDigest: false,
})

const editable = computed(() => props.mode === 'editable')

const localeOptions = computed(() => [
  { value: 'en', label: t('locales.en') },
  { value: 'pl', label: t('locales.pl') },
])

async function loadPreferences() {
  try {
    loading.value = true
    const response = await api.getCurrentUserPreferences()
    form.locale = response.preferences.locale || 'en'
    form.timezone = response.preferences.timezone || 'UTC'
    form.taskAssigned = Boolean(response.preferences.emailNotifications?.taskAssigned)
    form.taskCommented = Boolean(response.preferences.emailNotifications?.taskCommented)
    form.dailyDigest = Boolean(response.preferences.emailNotifications?.dailyDigest)
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.preferences.loadError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    loading.value = false
  }
}

async function savePreferences() {
  if (!editable.value || saving.value) return
  try {
    saving.value = true
    const response = await api.updateCurrentUserPreferences({
      locale: form.locale,
      timezone: form.timezone.trim() || 'UTC',
      emailNotifications: {
        taskAssigned: form.taskAssigned,
        taskCommented: form.taskCommented,
        dailyDigest: form.dailyDigest,
      },
    })
    locale.value = response.preferences.locale || locale.value
    layoutStore.openToast({
      type: 'success',
      message: t('settingsHub.account.preferences.saveSuccess'),
    })
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.preferences.saveError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadPreferences()
})
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.account.preferences.title')"
    :subtitle="$t('settingsHub.account.preferences.subtitle')"
    :mode="props.mode"
  >
    <div v-if="loading" class="text-sm text-base-content/70">
      {{ $t('settingsHub.account.preferences.loading') }}
    </div>
    <form v-else class="flex flex-col gap-3" @submit.prevent="savePreferences">
      <label class="form-control">
        <span class="label-text">{{ $t('settingsHub.account.preferences.locale') }}</span>
        <select
          v-model="form.locale"
          class="select select-bordered"
          :disabled="!editable || saving"
        >
          <option v-for="opt in localeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text">{{ $t('settingsHub.account.preferences.timezone') }}</span>
        <input
          v-model="form.timezone"
          type="text"
          class="input input-bordered"
          :readonly="!editable"
          :disabled="!editable || saving"
          placeholder="UTC"
        />
      </label>

      <div class="rounded-lg border border-base-300/60 p-3">
        <p class="text-sm font-medium mb-2">{{ $t('settingsHub.account.preferences.emailNotifications') }}</p>
        <label class="label cursor-pointer justify-start gap-3">
          <input v-model="form.taskAssigned" type="checkbox" class="checkbox checkbox-sm" :disabled="!editable || saving" />
          <span class="label-text">{{ $t('settingsHub.account.preferences.notifyTaskAssigned') }}</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input v-model="form.taskCommented" type="checkbox" class="checkbox checkbox-sm" :disabled="!editable || saving" />
          <span class="label-text">{{ $t('settingsHub.account.preferences.notifyTaskCommented') }}</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input v-model="form.dailyDigest" type="checkbox" class="checkbox checkbox-sm" :disabled="!editable || saving" />
          <span class="label-text">{{ $t('settingsHub.account.preferences.notifyDailyDigest') }}</span>
        </label>
      </div>
    </form>

    <template #actions>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!editable || saving"
        @click="savePreferences"
      >
        {{ saving ? $t('settingsHub.account.preferences.saving') : $t('settingsHub.account.preferences.save') }}
      </button>
    </template>
  </SettingsCard>
</template>
