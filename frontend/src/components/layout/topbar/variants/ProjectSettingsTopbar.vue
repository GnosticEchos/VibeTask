<script setup lang="ts">
// import BoardIcon from '@/components/icons/BoardIcon.vue'
// import SettingsIcon from '@/components/icons/SettingsIcon.vue'

import TopbarTemplate from '../TopbarTemplate.vue'

// const { navigateToSettings, navigateToBoard } = useProjectTopbarUtilities()
</script>

<template>
  <TopbarTemplate>
    <template v-slot:title>
      <span>{{ $t('settings.title') }}</span>
    </template>
    <template v-slot:right>
      <!-- Space reserved for theme toggles -->
    </template>
  </TopbarTemplate>
</template>
