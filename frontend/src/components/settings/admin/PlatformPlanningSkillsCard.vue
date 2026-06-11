<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import PlanningSkillEditorDialog from '@/components/settings/planning/PlanningSkillEditorDialog.vue'
import { usePlanningSkillsCatalogQuery } from '@/composables/usePlanningSkillsCatalogQuery'
import { usePlanningSkillMutations } from '@/composables/usePlanningSkillMutations'
import {
  extractPlanningSkillApiError,
  getAdminPlanningSkill,
  listAdminPlanningSkillRevisions,
  type PlanningSkillCatalogEntry,
  type PlanningSkillRevision,
} from '@/api/v1/planningSkillsApi'
import { useLayoutStore } from '@/stores/layout'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const catalogQuery = usePlanningSkillsCatalogQuery()
const { syncMutation, revertMutation } = usePlanningSkillMutations('platform')

const editorOpen = ref(false)
const editorSlug = ref('')
const editorContent = ref('')
const editorLoading = ref(false)

const revisionsOpen = ref(false)
const revisionsSlug = ref('')
const revertPendingId = ref<string | null>(null)

const revisionsQuery = useQuery({
  queryKey: ['admin', 'planning-skills', revisionsSlug, 'revisions'],
  queryFn: () => listAdminPlanningSkillRevisions(revisionsSlug.value),
  enabled: () => revisionsOpen.value && revisionsSlug.value.length > 0,
})

const forbidden = computed(() => {
  if (!catalogQuery.isError.value || !catalogQuery.error.value) return false
  const status = (catalogQuery.error.value as { response?: { status?: number } })?.response?.status
  return status === 403 || status === 401
})

const catalog = computed(() => catalogQuery.data.value ?? [])
const dbEmpty = computed(
  () => catalog.value.length > 0 && catalog.value.every((row) => row.source === 'filesystem'),
)

function truncateHash(hash: string | null | undefined): string {
  if (!hash) return '—'
  return hash.length <= 10 ? hash : `${hash.slice(0, 8)}…`
}

function formatUpdatedAt(entry: PlanningSkillCatalogEntry): string {
  if (!entry.dbUpdatedAt) return '—'
  return new Date(entry.dbUpdatedAt).toLocaleString()
}

function sourceLabel(source: PlanningSkillCatalogEntry['source']): string {
  return t(`settingsHub.admin.planningSkills.source.${source}`)
}

async function syncFromRepo() {
  try {
    const synced = await syncMutation.mutateAsync()
    layoutStore.openToast({
      message: t('settingsHub.admin.planningSkills.syncSuccess', { count: synced }),
      type: 'success',
    })
    await catalogQuery.refetch()
  } catch (error: unknown) {
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.admin.planningSkills.syncError')),
      type: 'error',
    })
  }
}

async function openEditor(entry: PlanningSkillCatalogEntry) {
  editorSlug.value = entry.slug
  editorContent.value = ''
  editorOpen.value = true
  editorLoading.value = true
  try {
    const skill = await getAdminPlanningSkill(entry.slug)
    editorContent.value = skill.content
  } catch (error: unknown) {
    editorOpen.value = false
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.admin.planningSkills.loadError')),
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
  catalogQuery.refetch()
}

function openRevisions(entry: PlanningSkillCatalogEntry) {
  revisionsSlug.value = entry.slug
  revisionsOpen.value = true
}

function closeRevisions() {
  revisionsOpen.value = false
  revisionsSlug.value = ''
}

async function confirmRevert(revision: PlanningSkillRevision) {
  const ok = window.confirm(
    t('settingsHub.admin.planningSkills.revertConfirm', {
      slug: revisionsSlug.value,
      date: new Date(revision.createdAt).toLocaleString(),
    }),
  )
  if (!ok) return

  revertPendingId.value = revision.id
  try {
    await revertMutation.mutateAsync({ slug: revisionsSlug.value, revisionId: revision.id })
    layoutStore.openToast({
      message: t('settingsHub.admin.planningSkills.revertSuccess'),
      type: 'success',
    })
    await catalogQuery.refetch()
    await revisionsQuery.refetch()
  } catch (error: unknown) {
    layoutStore.openToast({
      message: extractPlanningSkillApiError(error, t('settingsHub.admin.planningSkills.revertError')),
      type: 'error',
    })
  } finally {
    revertPendingId.value = null
  }
}
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.admin.planningSkills.title')"
    :subtitle="$t('settingsHub.admin.planningSkills.subtitle')"
  >
    <div v-if="catalogQuery.isLoading.value && !catalogQuery.isFetched.value" class="flex justify-center py-6">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div
      v-else-if="forbidden"
      class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      {{ $t('settingsApp.admin.accessRequired') }}
    </div>

    <div v-else-if="catalogQuery.isError.value" class="alert alert-error text-sm">
      <span>{{ $t('settingsHub.admin.planningSkills.loadListError') }}</span>
      <button type="button" class="btn btn-ghost btn-xs ml-2" @click="catalogQuery.refetch()">
        {{ $t('settingsApp.admin.rateLimitRetry') }}
      </button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-base-content/70 max-w-prose">
          {{ $t('settingsHub.admin.planningSkills.lead') }}
        </p>
        <BaseButton
          variant="outline"
          small
          :loading="syncMutation.isPending.value"
          @click="syncFromRepo"
        >
          {{ $t('settingsHub.admin.planningSkills.syncButton') }}
        </BaseButton>
      </div>

      <div
        v-if="dbEmpty"
        class="rounded-lg border border-base-300/80 bg-base-200/60 px-3 py-2 text-sm text-base-content/80"
      >
        {{ $t('settingsHub.admin.planningSkills.emptyDb') }}
      </div>

      <div v-if="catalog.length === 0" class="text-sm text-base-content/70">
        {{ $t('settingsHub.admin.planningSkills.emptyCatalog') }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="table table-zebra table-sm">
          <thead>
            <tr>
              <th>{{ $t('settingsHub.admin.planningSkills.colSlug') }}</th>
              <th>{{ $t('settingsHub.admin.planningSkills.colSource') }}</th>
              <th>{{ $t('settingsHub.admin.planningSkills.colUpdated') }}</th>
              <th>{{ $t('settingsHub.admin.planningSkills.colHash') }}</th>
              <th>{{ $t('settingsHub.admin.planningSkills.colActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in catalog" :key="entry.slug">
              <td><code class="text-xs">{{ entry.slug }}</code></td>
              <td>
                <span class="badge badge-sm badge-ghost">{{ sourceLabel(entry.source) }}</span>
                <span
                  v-if="entry.syncAvailable"
                  class="badge badge-sm badge-warning ml-1"
                >
                  {{ $t('settingsHub.admin.planningSkills.syncAvailable') }}
                </span>
              </td>
              <td class="text-xs whitespace-nowrap">{{ formatUpdatedAt(entry) }}</td>
              <td class="font-mono text-xs">{{ truncateHash(entry.dbContentHash ?? entry.filesystemHash) }}</td>
              <td class="space-x-1 whitespace-nowrap">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  :disabled="editorLoading && editorSlug === entry.slug"
                  @click="openEditor(entry)"
                >
                  {{ $t('settingsHub.admin.planningSkills.edit') }}
                </button>
                <button
                  v-if="entry.dbContentHash"
                  type="button"
                  class="btn btn-ghost btn-xs"
                  @click="openRevisions(entry)"
                >
                  {{ $t('settingsHub.admin.planningSkills.revisions') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <PlanningSkillEditorDialog
      :open="editorOpen && !editorLoading"
      :slug="editorSlug"
      scope="platform"
      :initial-content="editorContent"
      @close="closeEditor"
      @saved="onEditorSaved"
    />

    <dialog class="modal" :class="{ 'modal-open': revisionsOpen }">
      <div class="modal-box max-w-2xl">
        <h3 class="text-lg font-semibold">
          {{ $t('settingsHub.admin.planningSkills.revisionsTitle', { slug: revisionsSlug }) }}
        </h3>
        <div v-if="revisionsQuery.isLoading.value" class="flex justify-center py-6">
          <span class="loading loading-spinner" />
        </div>
        <div v-else-if="(revisionsQuery.data.value?.length ?? 0) === 0" class="py-4 text-sm text-base-content/70">
          {{ $t('settingsHub.admin.planningSkills.revisionsEmpty') }}
        </div>
        <ul v-else class="mt-3 max-h-64 space-y-2 overflow-y-auto">
          <li
            v-for="revision in revisionsQuery.data.value"
            :key="revision.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-300/60 px-3 py-2 text-sm"
          >
            <span class="text-xs text-base-content/80">
              {{ new Date(revision.createdAt).toLocaleString() }}
              <span v-if="revision.authorId" class="text-base-content/50">
                · {{ $t('settingsHub.admin.planningSkills.authorId', { id: revision.authorId }) }}
              </span>
            </span>
            <button
              type="button"
              class="btn btn-outline btn-xs"
              :disabled="revertPendingId === revision.id || revertMutation.isPending.value"
              @click="confirmRevert(revision)"
            >
              {{ $t('settingsHub.admin.planningSkills.revert') }}
            </button>
          </li>
        </ul>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="closeRevisions">
            {{ $t('docs.cancel') }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" @click="closeRevisions">close</button>
      </form>
    </dialog>
  </SettingsCard>
</template>
