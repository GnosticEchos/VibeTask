<script setup lang="ts">
import SettingsCard from '@/components/settings/SettingsCard.vue'
import ThemePlayground from '@/views/ThemePlayground.vue'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'

const props = withDefaults(
  defineProps<{
    mode?: SettingsCardMode
    title?: string
    subtitle?: string
  }>(),
  {
    mode: 'editable',
  },
)
</script>

<template>
  <SettingsCard
    :title="props.title || $t('settingsHub.theme.title')"
    :subtitle="props.subtitle || $t('settingsHub.theme.subtitle')"
    :mode="props.mode"
  >
    <div class="w-full min-w-0 overflow-x-auto">
      <div class="min-w-0 w-full max-w-full">
        <ThemePlayground />
      </div>
    </div>
  </SettingsCard>
</template>
