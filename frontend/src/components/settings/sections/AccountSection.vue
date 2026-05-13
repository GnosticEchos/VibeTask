<script setup lang="ts">
import ProfileCard from '@/components/settings/cards/ProfileCard.vue'
import PreferencesCard from '@/components/settings/cards/PreferencesCard.vue'
import SecurityCard from '@/components/settings/cards/SecurityCard.vue'
import SessionsCard from '@/components/settings/cards/SessionsCard.vue'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import DraggableSettingsGrid from '@/components/settings/layout/DraggableSettingsGrid.vue'
import { useSettingsLayout } from '@/composables/useSettingsLayout'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { useAuthStore } from '@/stores/auth'
import { computed, watchEffect } from 'vue'

const { accountMode } = useSettingsPermissions()

const authStore = useAuthStore()
const layoutStore = useSettingsLayoutStore()
watchEffect(() => {
  layoutStore.setUserId(String(authStore.user?.id || 'anonymous'))
})

const { layout, setLayout } = useSettingsLayout('account')
const isEditableLayout = computed(() => accountMode.value !== 'hidden' && layoutStore.isEditMode)
const allowedCardIds = new Set([
  'account.profile',
  'account.security',
  'account.sessions',
  'account.preferences',
])
const accountLayout = computed(() => ({
  ...layout.value,
  cards: layout.value.cards.filter((card) => allowedCardIds.has(card.id)),
}))

watchEffect(() => {
  if (layout.value.cards.length !== accountLayout.value.cards.length) {
    setLayout(accountLayout.value)
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-2xl font-semibold">{{ $t('settingsHub.account.title') }}</h2>

    <DraggableSettingsGrid
      :layout="accountLayout"
      :editable="isEditableLayout"
      @layoutChange="setLayout"
    >
      <template #default="{ cardId }">
        <div v-if="cardId === 'account.profile'">
          <ProfileCard :mode="accountMode" />
        </div>
        <div v-else-if="cardId === 'account.security'">
          <SecurityCard :mode="accountMode" />
        </div>
        <div v-else-if="cardId === 'account.sessions'">
          <SessionsCard :mode="accountMode" />
        </div>
        <div v-else-if="cardId === 'account.preferences'">
          <PreferencesCard :mode="accountMode" />
        </div>
      </template>
    </DraggableSettingsGrid>
  </div>
</template>
