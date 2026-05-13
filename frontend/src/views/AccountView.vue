<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace({ path: '/dashboard/settings', query: { tab: 'account' } })
})
</script>

<template>
  <div class="flex items-center justify-center min-h-[40vh]">
    <span class="loading loading-spinner loading-lg" aria-label="Loading account" />
  </div>
</template>
