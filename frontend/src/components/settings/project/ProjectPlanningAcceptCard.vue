<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { usePlanningPreviewQuery } from '@/composables/useDraftProjectsQuery'
import projectsApi from '@/api/v1/projectApi'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps<{
  projectId: number
}>()

const router = useRouter()
const queryClient = useQueryClient()
const accepting = ref(false)
const acceptError = ref<string | null>(null)

const { data: preview, isLoading, refetch } = usePlanningPreviewQuery(() => props.projectId)

const isDraft = computed(() => preview.value?.lifecycleStatus === 'DRAFT')

const checklistFailed = computed(
  () => preview.value?.checklist?.some((item) => !item.passed) ?? false,
)

async function acceptProject() {
  acceptError.value = null
  accepting.value = true
  try {
    await projectsApi.acceptDraftProject(props.projectId)
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    await queryClient.invalidateQueries({ queryKey: ['projects', 'drafts'] })
    await queryClient.invalidateQueries({ queryKey: ['planning-preview', () => props.projectId] })
    await refetch()
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    acceptError.value = message ?? 'Accept failed'
  } finally {
    accepting.value = false
  }
}

function goCreateDelegate() {
  router.push({ path: '/dashboard/settings/agents' })
}
</script>

<template>
  <div v-if="isDraft" class="rounded-lg border border-warning/40 bg-warning/10 p-4 space-y-3">
    <div class="flex items-center gap-2">
      <span class="badge badge-warning badge-sm">DRAFT</span>
      <h3 class="font-semibold text-sm">Project acceptance</h3>
    </div>
    <p class="text-xs text-base-content/70">
      This project was created by an agent and is not live yet. Review the checklist, then accept to enable the board and delegate agents.
    </p>

    <div v-if="isLoading" class="text-xs text-base-content/60">Loading preview…</div>
    <template v-else-if="preview">
      <ul class="text-xs space-y-1">
        <li
          v-for="item in preview.checklist"
          :key="item.id"
          :class="item.passed ? 'text-success' : 'text-error'"
        >
          {{ item.passed ? '✓' : '○' }} {{ item.label }}
        </li>
      </ul>
      <p class="text-xs text-base-content/60">
        {{ preview.backlogCount }} backlog task(s) · {{ preview.documents.length }} document(s) · template {{ preview.templateId ?? '—' }}
      </p>
      <ul v-if="preview.warnings.length" class="text-xs text-warning space-y-1">
        <li v-for="(warning, idx) in preview.warnings" :key="idx">{{ warning }}</li>
      </ul>
    </template>

    <p v-if="acceptError" class="text-xs text-error">{{ acceptError }}</p>

    <div class="flex flex-wrap gap-2">
      <BaseButton
        variant="primary"
        size="sm"
        :disabled="accepting || checklistFailed"
        @click="acceptProject"
      >
        {{ accepting ? 'Accepting…' : 'Accept project' }}
      </BaseButton>
      <BaseButton variant="ghost" size="sm" @click="goCreateDelegate">
        Create delegate agent
      </BaseButton>
    </div>
  </div>
  <div v-else-if="preview?.lifecycleStatus === 'ACTIVE'" class="rounded-lg border border-base-300 p-4 space-y-2">
    <p class="text-xs text-base-content/70">Project is active. Create a delegate agent to enable board writes.</p>
    <BaseButton variant="ghost" size="sm" @click="goCreateDelegate">Create delegate agent</BaseButton>
  </div>
</template>
