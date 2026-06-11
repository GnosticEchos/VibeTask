<script setup lang="ts">
import { computed, ref, toRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDark } from '@vueuse/core'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import PlanningSkillEditorDialog from '@/components/settings/planning/PlanningSkillEditorDialog.vue'
import { usePlanningPreviewQuery } from '@/composables/useDraftProjectsQuery'
import { useProjectPlanningSkillsQuery } from '@/composables/useProjectPlanningSkillsQuery'
import { usePlanningSkillMutations } from '@/composables/usePlanningSkillMutations'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import {
  extractPlanningSkillApiError,
  getProjectPlanningSkill,
  type ProjectPlanningSkillIndexEntry,
} from '@/api/v1/planningSkillsApi'
import { configureMdEditorMermaid } from '@/lib/md-editor-mermaid'
import { useLayoutStore } from '@/stores/layout'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'

const props = defineProps<{
  projectId: number
  mode?: SettingsCardMode
}>()

const { t } = useI18n()
const router = useRouter()
const layoutStore = useLayoutStore()
const { canUseAdmin } = useSettingsPermissions()
const projectIdRef = toRef(props, 'projectId')
const skillsQuery = useProjectPlanningSkillsQuery(projectIdRef)
const { deleteOverrideMutation } = usePlanningSkillMutations('project', projectIdRef)
const previewQuery = usePlanningPreviewQuery(() => props.projectId)

const isDraft = computed(() => previewQuery.data.value?.lifecycleStatus === 'DRAFT')
const canEdit = computed(() => props.mode !== 'read-only')

const editorOpen = ref(false)
const editorSlug = ref('')
const editorContent = ref('')
const editorLoading = ref(false)

const previewOpen = ref(false)
const previewSlug = ref('')
const previewContent = ref('')
const previewLoading = ref(false)
const previewRow = ref<ProjectPlanningSkillIndexEntry | null>(null)

let MdPreview: Component | null = null
const previewReady = ref(false)

const isDark = useDark({
  selector: 'html',
  attribute: 'data-theme',
  valueDark: 'dark',
  valueLight: 'light',
})

const skills = computed(() => skillsQuery.data.value ?? [])

function statusLabel(row: ProjectPlanningSkillIndexEntry): string {
  return row.hasOverride
    ? t('settingsHub.project.planningSkills.statusOverride')
    : t('settingsHub.project.planningSkills.statusDefault')
}

function resolutionSteps(row: ProjectPlanningSkillIndexEntry): string[] {
  if (row.hasOverride) {
    return [t('settingsHub.project.planningSkills.resolutionOverride')]
  }
  if (row.catalogSource === 'db' || row.catalogSource === 'both') {
    return [
      t('settingsHub.project.planningSkills.resolutionPlatform'),
      t('settingsHub.project.planningSkills.resolutionFilesystem'),
    ]
  }
  return [t('settingsHub.project.planningSkills.resolutionFilesystemOnly')]
}

async function loadPreviewComponent() {
  if (MdPreview) return
  await configureMdEditorMermaid()
  const mod = await import('md-editor-v3')
  await import('md-editor-v3/lib/style.css')
  MdPreview = mod.MdPreview
  previewReady.value = true
}

async function openPreview(row: ProjectPlanningSkillIndexEntry) {
  previewSlug.value = row.slug
  previewRow.value = row
  previewContent.value = ''
  previewOpen.value = true
  previewLoading.value = true
  try {
    const skill = await getProjectPlanningSkill(props.projectId, row.slug)
    previewContent.value = skill.content
    await loadPreviewComponent()
  } catch (error: unknown) {
    previewOpen.value = false
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.project.planningSkills.loadError')),
      type: 'error',
    })
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewOpen.value = false
  previewSlug.value = ''
  previewContent.value = ''
  previewRow.value = null
}

async function openEditor(row: ProjectPlanningSkillIndexEntry) {
  if (!canEdit.value) return
  editorSlug.value = row.slug
  editorContent.value = ''
  editorOpen.value = true
  editorLoading.value = true
  try {
    const skill = await getProjectPlanningSkill(props.projectId, row.slug)
    editorContent.value = skill.content
  } catch (error: unknown) {
    editorOpen.value = false
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.project.planningSkills.loadError')),
      type: 'error',
    })
  } finally {
    editorLoading.value = false
  }
}

function closeEditor() {
  editorOpen.value = false
  editorSlug.value = ''
  editorContent.value = ''
}

function onEditorSaved() {
  skillsQuery.refetch()
  previewQuery.refetch()
}

async function resetOverride(row: ProjectPlanningSkillIndexEntry) {
  if (!canEdit.value || !row.hasOverride) return
  const ok = window.confirm(
    t('settingsHub.project.planningSkills.resetConfirm', { slug: row.slug }),
  )
  if (!ok) return
  try {
    await deleteOverrideMutation.mutateAsync({ slug: row.slug })
    layoutStore.openToast({
      message: t('settingsHub.project.planningSkills.resetSuccess'),
      type: 'success',
    })
    await skillsQuery.refetch()
  } catch (error: unknown) {
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.project.planningSkills.resetError')),
      type: 'error',
    })
  }
}

function goAdminPlanningSkills() {
  router.push({ path: '/dashboard/settings/admin' })
}

watch(previewOpen, (open) => {
  if (!open) previewRow.value = null
})
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.project.planningSkills.title')"
    :subtitle="$t('settingsHub.project.planningSkills.subtitle')"
    :mode="mode"
  >
    <div
      v-if="isDraft"
      class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <span class="badge badge-warning badge-sm mr-2">DRAFT</span>
      {{ $t('settingsHub.project.planningSkills.draftCallout') }}
    </div>

    <p class="text-sm text-base-content/70">
      {{ $t('settingsHub.project.planningSkills.lead') }}
    </p>

    <p v-if="canUseAdmin" class="text-xs text-base-content/60">
      {{ $t('settingsHub.project.planningSkills.adminLink') }}
      <button type="button" class="link link-primary" @click="goAdminPlanningSkills">
        {{ $t('settingsHub.project.planningSkills.adminLinkAction') }}
      </button>
    </p>

    <div v-if="skillsQuery.isLoading.value && !skillsQuery.isFetched.value" class="flex justify-center py-6">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="skillsQuery.isError.value" class="alert alert-error text-sm">
      <span>{{ $t('settingsHub.project.planningSkills.loadListError') }}</span>
      <button type="button" class="btn btn-ghost btn-xs ml-2" @click="skillsQuery.refetch()">
        {{ $t('settingsApp.admin.rateLimitRetry') }}
      </button>
    </div>

    <div v-else-if="skills.length === 0" class="text-sm text-base-content/70">
      {{ $t('settingsHub.project.planningSkills.emptyCatalog') }}
    </div>

    <div v-else class="overflow-x-auto">
      <table class="table table-zebra table-sm">
        <thead>
          <tr>
            <th>{{ $t('settingsHub.project.planningSkills.colSlug') }}</th>
            <th>{{ $t('settingsHub.project.planningSkills.colStatus') }}</th>
            <th>{{ $t('settingsHub.project.planningSkills.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in skills" :key="row.slug">
            <td><code class="text-xs">{{ row.slug }}</code></td>
            <td>
              <span
                class="badge badge-sm"
                :class="row.hasOverride ? 'badge-primary' : 'badge-ghost'"
              >
                {{ statusLabel(row) }}
              </span>
            </td>
            <td class="space-x-1 whitespace-nowrap">
              <button type="button" class="btn btn-ghost btn-xs" @click="openPreview(row)">
                {{ $t('settingsHub.project.planningSkills.viewEffective') }}
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="btn btn-ghost btn-xs"
                :disabled="editorLoading && editorSlug === row.slug"
                @click="openEditor(row)"
              >
                {{ $t('settingsHub.project.planningSkills.customize') }}
              </button>
              <button
                v-if="canEdit && row.hasOverride"
                type="button"
                class="btn btn-ghost btn-xs text-warning"
                :disabled="deleteOverrideMutation.isPending.value"
                @click="resetOverride(row)"
              >
                {{ $t('settingsHub.project.planningSkills.reset') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PlanningSkillEditorDialog
      :open="editorOpen && !editorLoading"
      :slug="editorSlug"
      scope="project"
      :project-id="projectId"
      :initial-content="editorContent"
      @close="closeEditor"
      @saved="onEditorSaved"
    />

    <dialog class="modal" :class="{ 'modal-open': previewOpen }">
      <div class="modal-box flex max-h-[85vh] max-w-4xl flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold">
              {{ $t('settingsHub.project.planningSkills.previewTitle', { slug: previewSlug }) }}
            </h3>
            <ul v-if="previewRow" class="mt-1 text-xs text-base-content/70 space-y-0.5">
              <li v-for="(step, idx) in resolutionSteps(previewRow)" :key="idx">
                {{ idx === 0 && previewRow.hasOverride ? '✓' : '→' }} {{ step }}
              </li>
            </ul>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-circle" @click="closePreview">✕</button>
        </div>

        <div v-if="previewLoading" class="flex flex-1 items-center justify-center py-12">
          <span class="loading loading-spinner loading-lg" />
        </div>
        <div v-else class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-base-300/60 p-3">
          <component
            v-if="previewReady && previewContent"
            :is="MdPreview"
            :model-value="previewContent"
            :editor-id="`skill-preview-${previewSlug}`"
            :theme="isDark ? 'dark' : 'light'"
            class="doc-md-preview bg-transparent"
          />
          <pre v-else class="whitespace-pre-wrap text-sm">{{ previewContent }}</pre>
        </div>

        <div class="modal-action mt-0">
          <button type="button" class="btn btn-sm" @click="closePreview">
            {{ $t('docs.cancel') }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" @click="closePreview">close</button>
      </form>
    </dialog>
  </SettingsCard>
</template>
