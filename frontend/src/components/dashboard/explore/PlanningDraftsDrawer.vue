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

function columnLabel(name: string): string {
  return name.replace(/^\d+\.\s*/, '')
}
</script>

<template>
  <aside
    class="shrink-0 border-l border-base-300 bg-base-100 shadow-xl overflow-hidden transition-[width] duration-200 ease-out"
    :class="isOpen ? 'w-[min(360px,100vw)]' : 'w-0 border-l-0'"
    :aria-hidden="!isOpen"
  >
    <div class="flex h-full w-[min(360px,100vw)] flex-col">
      <div class="flex shrink-0 items-center justify-between border-b border-base-300 px-4 py-3">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-sm">Draft projects</h3>
          <span v-if="draftCount > 0" class="badge badge-warning badge-xs">{{ draftCount }}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-xs btn-square" aria-label="Close drafts" @click="isOpen = false">
          ✕
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <p v-if="isLoading" class="text-sm text-base-content/60">Loading drafts…</p>
        <p v-else-if="draftCount === 0" class="text-sm text-base-content/60">
          No draft projects. Agents create drafts during planning; accept them in Settings → Project.
        </p>
        <ul v-else class="space-y-3">
          <li
            v-for="draft in drafts"
            :key="draft.id"
            class="rounded-lg border border-base-300 bg-base-200/40 p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate font-medium">{{ draft.name }}</div>
                <span class="badge badge-ghost badge-xs mt-1">{{ draft.prefix }}</span>
              </div>
              <span class="badge badge-warning badge-xs shrink-0">DRAFT</span>
            </div>

            <p v-if="draft.description" class="mt-2 line-clamp-3 text-xs text-base-content/80">
              {{ draft.description }}
            </p>

            <div v-if="draft.columns?.length" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="(col, index) in draft.columns.slice(0, 3)"
                :key="col.id"
                class="badge badge-xs"
                :class="index % 3 === 0 ? 'badge-primary' : index % 3 === 1 ? 'badge-secondary' : 'badge-accent'"
                :title="col.name"
              >
                {{ columnLabel(col.name) }}
              </span>
              <span v-if="draft.columns.length > 3" class="badge badge-xs badge-ghost">
                +{{ draft.columns.length - 3 }}
              </span>
            </div>

            <button
              type="button"
              class="btn btn-primary btn-xs mt-3 w-full"
              @click="reviewDraft(draft.id)"
            >
              Review &amp; accept
            </button>
          </li>
        </ul>
      </div>

      <div class="shrink-0 border-t border-base-300 px-4 py-3 text-xs text-base-content/60">
        Drafts stay off the board until accepted. Use Settings → Project or CLI
        <code class="rounded bg-base-200 px-1">project accept</code>.
      </div>
    </div>
  </aside>
</template>
