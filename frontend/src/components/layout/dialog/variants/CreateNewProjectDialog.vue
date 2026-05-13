<script setup lang="ts">
import ProjectDataInput from '@/components/dashboard/project/settings/inputs/ProjectDataInput.vue'
import DialogTemplate from '@/components/layout/dialog/DialogTemplate.vue'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { iUpdateColumn, UpdateColumn } from '@/types/columnTypes'
import { iMemberItem } from '@/types/userTypes'
import { randomPastelColor } from '@/utils/functions'
import { useForm } from 'vee-validate'
import { computed, reactive, Ref, ref, watch, onMounted } from 'vue'
import { axiosApi } from '@/api/axios'
import type { ProjectTemplate } from '@/types/documentTypes'
import { uiLog } from '@/utils/logger'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const activeTabValue: Ref<string> = ref('project-data')

const { errors: projectDataErrors, resetField } = useForm()

const loading = computed(() => {
  return projectStore.loading
})

const isColumnsSectionValid = computed(() => {
  return (
    Object.values(aggregatedErrors.value).filter((value) => value !== undefined)
      .length === 0
  )
})

const isProjectDataSectionValid = computed(() => {
  return Object.keys(projectDataErrors.value).length === 0 && project.name
})

const formIsValid = computed(() => {
  return isColumnsSectionValid.value && isProjectDataSectionValid.value
})

interface iProject {
  name: string
  description: string
  prefix: string
  columns: iUpdateColumn[]
  members: iMemberItem[]
}

const project: iProject = reactive({
  name: '',
  description: '',
  prefix: '',
  columns: [],
  members: [],
})

// Template selection
const templates = ref<ProjectTemplate[]>([])
const selectedTemplate = ref<string>('')

onMounted(async () => {
  try {
    const res = await axiosApi.get('/projects/templates')
    templates.value = res.data?.data || []
  } catch {
    // Templates not available, fall back to manual
  }
})

function selectTemplate(id: string) {
  selectedTemplate.value = id
  const tmpl = templates.value.find(t => t.id === id)
  if (tmpl) {
    project.columns = tmpl.columns.map((col, index) => new UpdateColumn({
      id: null,
      color: col.color || randomPastelColor(),
      order: col.order ?? index,
      name: col.name,
      type: (col.type as 'start' | 'end' | null) || null,
      description: col.description || '',
    }))
  }
}

watch(
  () => project.name,
  () => {
    if (project.name.length > 2) {
      project.prefix = project.name.substring(0, 3).toUpperCase()
      resetField('prefixField')
    }
    if (project.name.length === 0) {
      project.prefix = ''
      resetField('prefixField')
    }
  },
)
const addNewColumn = () => {
  const newColumn = new UpdateColumn({
    id: null,
    color: randomPastelColor(),
    order: project.columns.length + 1,
    name: '',
    type: null,
    description: '',
  })

  project.columns.push(newColumn)
}

const aggregatedErrors: Ref<Record<string, string | undefined>> = ref({})

const submitProject = async () => {
  if (formIsValid.value) {
    try {
      const params = {
        id: 0,
        role: '',
        tasks: [],
        ...project,
        template: selectedTemplate.value || undefined,
        members: project.members.map((member) => ({
          id: member.id,
          avatarUrl: member.avatarUrl,
          fullName: member.fullName,
        })),
        columns: project.columns.map((col) => ({
          id: col.id === null ? 0 : col.id,
          name: col.name,
          color: col.color,
          order: col.order,
          type: col.type,
          description: col.description,
          isNew: col.isNew,
          roleType: (col as any).roleType || 'STANDARD',
        })),
      }
      await projectStore.setProject(params)
      layoutStore.openToast({ message: 'Project created.', type: 'success' })
    } catch (err: any) {
      layoutStore.openToast({ message: err.message || 'An unexpected error occurred.', type: 'error' })
      uiLog.error('Project creation error', { error: err })
    }
  }
}
</script>

<template>
  <form @submit.prevent="" class="flex flex-col">
    <DialogTemplate :loading="loading" denseActions>
      <template #content>
        <!-- Template picker -->
        <div v-if="templates.length > 0" class="px-4 pt-4 mb-2">
          <label class="label"><span class="label-text font-semibold">Template</span></label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="tmpl in templates"
              :key="tmpl.id"
              class="card bg-base-200 cursor-pointer transition-all"
              :class="{ 'ring-2 ring-primary': selectedTemplate === tmpl.id }"
              @click="selectTemplate(tmpl.id)"
            >
              <div class="card-body p-3">
                <h3 class="card-title text-sm">{{ tmpl.name }}</h3>
                <p class="text-xs text-base-content/60">{{ tmpl.description }}</p>
                <div class="flex gap-1 mt-1 flex-wrap">
                  <span v-for="col in tmpl.columns" :key="col.name" class="badge badge-xs badge-ghost">{{ col.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 pt-4">
          <ProjectDataInput
            v-model:name="project.name"
            v-model:description="project.description"
            v-model:prefix="project.prefix"
          />
        </div>
      </template>
      <template #toolsButtons>
        <BaseButton
          v-if="activeTabValue === 'columns'"
          outlined
          :label="$t('settings.columns.addNewColumn')"
          icon="plus"
          :disabled="loading"
          @click="addNewColumn"
        />
      </template>
      <template #actions>
        <BaseButton
          type="submit"
          :label="$t('project.createProject')"
          icon="check"
          :disabled="!formIsValid || loading"
          @click="submitProject"
        />
      </template>
    </DialogTemplate>
  </form>
</template>
