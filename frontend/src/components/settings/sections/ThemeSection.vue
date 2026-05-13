<script setup lang="ts">
import ThemeCard from '@/components/settings/cards/ThemeCard.vue'
import DraggableSettingsGrid from '@/components/settings/layout/DraggableSettingsGrid.vue'
import { useSettingsLayout } from '@/composables/useSettingsLayout'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { useAuthStore } from '@/stores/auth'
import { computed, watchEffect } from 'vue'

const { accountMode } = useSettingsPermissions()

const authStore = useAuthStore()
const layoutStore = useSettingsLayoutStore()
watchEffect(() => {
  layoutStore.setUserId(String(authStore.user?.id || 'anonymous'))
})

const { layout, setLayout } = useSettingsLayout('themeBuilder')
const isEditableLayout = computed(() => accountMode.value !== 'hidden' && layoutStore.isEditMode)
const allowedCardIds = new Set(['theme.builder'])
const themeLayout = computed(() => ({
  ...layout.value,
  cards: layout.value.cards.filter((card) => allowedCardIds.has(card.id)),
}))

watchEffect(() => {
  if (layout.value.cards.length !== themeLayout.value.cards.length) {
    setLayout(themeLayout.value)
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-2xl font-semibold">{{ $t('settingsHub.nav.themeBuilder') }}</h2>

    <DraggableSettingsGrid
      :layout="themeLayout"
      :editable="isEditableLayout"
      @layoutChange="setLayout"
    >
      <template #default="{ cardId }">
        <div v-if="cardId === 'theme.builder'">
          <ThemeCard
            :mode="accountMode === 'hidden' ? 'read-only' : accountMode"
            :title="$t('settingsHub.theme.playgroundTitle')"
            :subtitle="$t('settingsHub.theme.playgroundSubtitle')"
          />
        </div>
      </template>
    </DraggableSettingsGrid>
  </div>
</template>
