<script setup lang="ts">
// import BoardIcon from '@/components/icons/BoardIcon.vue'
// import SettingsIcon from '@/components/icons/SettingsIcon.vue'
// import BaseButton from '@/components/base/BaseButton.vue'
// import usePermittedUser from '@/composables/usePermittedUser'
import TopbarTemplate from '../TopbarTemplate.vue'


</script>

<template>
  <TopbarTemplate>
    <template v-slot:title>
      <span>{{ $t('backlog.title') }}</span>
    </template>
    <template v-slot:right>
      <!-- Space reserved for theme toggles -->
    </template>
  </TopbarTemplate>
</template>
