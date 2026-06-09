<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDraftProjectsQuery } from '@/composables/useDraftProjectsQuery'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
const { data: drafts, isLoading } = useDraftProjectsQuery()

const draftCount = computed(() => drafts.value?.length ?? 0)

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

function reviewDraft(projectId: number) {
  isOpen.value = false
  router.push({
    path: '/dashboard/settings/project',
    query: { acceptProject: String(projectId) },
  })
}
</script>

<template>
  <div
    class="fixed top-[5.5rem] right-0 h-[calc(100%-5.5rem)] w-[360px] bg-base-100 border-l border-base-300 shadow-2xl z-30 transition-transform duration-200"
    :class="isOpen ? 'translate-x-0' : 'translate-x-full'"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <h3 class="font-semibold">Draft projects</h3>
      <button type="button" class="btn btn-ghost btn-xs" @click="isOpen = false">✕</button>
    </div>
    <div class="p-4 overflow-y-auto h-[calc(100%-56px)]">
      <p v-if="isLoading" class="text-sm text-base-content/60">Loading drafts…</p>
      <p v-else-if="draftCount === 0" class="text-sm text-base-content/60">
        No draft projects. Agents create drafts during planning; accept them in Settings → Project.
      </p>
      <ul v-else class="space-y-3">
        <li
          v-for="draft in drafts"
          :key="draft.id"
          class="border border-base-300 rounded-lg p-3 bg-base-200/40"
        >
          <div class="font-medium">{{ draft.name }}</div>
          <div class="text-xs text-base-content/60 mt-1">{{ draft.prefix }}</div>
          <p v-if="draft.description" class="text-xs mt-2 line-clamp-2">{{ draft.description }}</p>
          <button
            type="button"
            class="btn btn-primary btn-xs mt-3"
            @click="reviewDraft(draft.id)"
          >
            Review &amp; accept
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
