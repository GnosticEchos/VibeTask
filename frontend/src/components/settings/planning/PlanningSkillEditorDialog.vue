<script setup lang="ts">
import { computed, ref, toRef, watch, type Component } from 'vue'
import { useDark } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/base/BaseButton.vue'
import { configureMdEditorMermaid } from '@/lib/md-editor-mermaid'
import {
  PLANNING_SKILL_MAX_BYTES,
  extractPlanningSkillApiError,
} from '@/api/v1/planningSkillsApi'
import {
  usePlanningSkillMutations,
  type PlanningSkillScope,
} from '@/composables/usePlanningSkillMutations'
import { useLayoutStore } from '@/stores/layout'

const props = defineProps<{
  open: boolean
  slug: string
  scope: PlanningSkillScope
  projectId?: number | null
  initialContent: string
  title?: string
}>()

const emit = defineEmits<{
  close: []
  saved: [content: string]
}>()

const { t } = useI18n()
const layoutStore = useLayoutStore()
const { upsertMutation } = usePlanningSkillMutations(props.scope, toRef(props, 'projectId'))

let MdEditor: Component | null = null
const editorLoaded = ref(false)
const editContent = ref('')
const saveError = ref('')

const isDark = useDark({
  selector: 'html',
  attribute: 'data-theme',
  valueDark: 'dark',
  valueLight: 'light',
})

const editorId = `planning-skill-editor-${Math.random().toString(36).slice(2, 9)}`

const toolbars = [
  'bold',
  'italic',
  'strikeThrough',
  'title',
  'sub',
  'sup',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  'code',
  'codeRow',
  'link',
  'table',
  '-',
  'revoke',
  'next',
  'pageFullscreen',
  'preview',
  'fullscreen',
  'previewOnly',
]

const byteCount = computed(() => new TextEncoder().encode(editContent.value).length)
const overByteLimit = computed(() => byteCount.value > PLANNING_SKILL_MAX_BYTES)
const canSave = computed(
  () =>
    editContent.value.trim().length > 0
    && !overByteLimit.value
    && !upsertMutation.isPending.value,
)

const dialogTitle = computed(
  () => props.title ?? t('settingsHub.planningSkills.editorTitle', { slug: props.slug }),
)

async function loadEditor() {
  if (MdEditor) return
  await configureMdEditorMermaid()
  const mod = await import('md-editor-v3')
  await import('md-editor-v3/lib/style.css')
  MdEditor = mod.MdEditor
  editorLoaded.value = true
}

watch(
  () => [props.open, props.initialContent] as const,
  async ([open, content]) => {
    if (!open) return
    saveError.value = ''
    editContent.value = content
    await loadEditor()
  },
  { immediate: true },
)

function close() {
  saveError.value = ''
  emit('close')
}

async function save() {
  if (!canSave.value) return
  saveError.value = ''
  try {
    await upsertMutation.mutateAsync({ slug: props.slug, content: editContent.value })
    layoutStore.openToast({
      message: t('settingsHub.planningSkills.saveSuccess'),
      type: 'success',
    })
    emit('saved', editContent.value)
    close()
  } catch (error: unknown) {
    saveError.value = extractPlanningSkillApiError(
      error,
      t('settingsHub.planningSkills.saveError'),
    )
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal modal-open fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
    <div class="modal-box flex max-h-[90vh] w-full max-w-5xl flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold">{{ dialogTitle }}</h3>
          <p class="text-sm text-base-content/70">
            {{ t('settingsHub.planningSkills.editorHint') }}
          </p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm btn-circle" @click="close">✕</button>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-base-300">
        <div v-if="!editorLoaded" class="flex h-[50vh] items-center justify-center">
          <span class="loading loading-spinner loading-lg" />
        </div>
        <component
          :is="MdEditor"
          v-else
          v-model="editContent"
          :editor-id="editorId"
          language="en-US"
          :toolbars="toolbars"
          :toolbarsExclude="['image']"
          :preview="true"
          :show-toolbar="true"
          :autofocus="false"
          :theme="isDark ? 'dark' : 'light'"
          class="planning-skill-md-editor"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span :class="overByteLimit ? 'text-error' : 'text-base-content/70'">
          {{ byteCount.toLocaleString() }} / {{ PLANNING_SKILL_MAX_BYTES.toLocaleString() }}
          {{ t('settingsHub.planningSkills.bytesLabel') }}
        </span>
        <p v-if="saveError" class="text-error">{{ saveError }}</p>
      </div>

      <div class="modal-action mt-0">
        <BaseButton variant="ghost" @click="close">
          {{ t('docs.cancel') }}
        </BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!canSave"
          :loading="upsertMutation.isPending.value"
          @click="save"
        >
          {{ t('docs.save') }}
        </BaseButton>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="close">
      <button type="button">close</button>
    </form>
    </div>
  </Teleport>
</template>

<style scoped>
.planning-skill-md-editor {
  height: 50vh !important;
}

.planning-skill-md-editor :deep(.md-editor) {
  height: 50vh !important;
}

.planning-skill-md-editor :deep(.md-editor-content) {
  height: calc(50vh - 56px) !important;
}
</style>
