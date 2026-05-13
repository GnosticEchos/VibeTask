<script setup lang="ts">
import { onMounted, watch, computed, ref } from 'vue'
import { isValidId } from '@/utils/validation'
import { useRoute } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useProjectStore } from '@/stores/project'
import { useLayoutStore } from '@/stores/layout'
import { useI18n } from 'vue-i18n'
import ColumnsSection from './partials/ColumnsSectionPartial.vue'
import DangerZone from './partials/DangerZone.vue'
import projectsApi from '@/api/v1/projectApi'
import { uiLog } from '@/utils/logger'

const route = useRoute()
const queryClient = useQueryClient()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const { t } = useI18n()

const projectId = computed(() => {
  const id = route.params.id
  return isValidId(id) ? Number(id) : 0
})

const invalidProjectId = ref(false)
const loading = ref(false)

onMounted(async () => {
  if (!projectId.value) {
    invalidProjectId.value = true
    return
  }
  // Always fetch fresh project data when settings page is loaded
  loading.value = true
  try {
    const projectData = await projectsApi.getSingleProject(projectId.value)
    projectStore.setProject({ ...projectStore.project, ...projectData })
    // Set the selected project ID in the store
    projectStore.setSelectedProjectId(projectId.value)
  } catch (e) {
    uiLog.error('Error fetching project data', { error: e })
    invalidProjectId.value = true
  } finally {
    loading.value = false
  }
})

const saveProjectData = async () => {
  try {
    loading.value = true
    const updatedProject = await projectsApi.updateProject(projectId.value, {
      name: projectName.value,
      description: projectDescription.value
    })
    projectStore.setProject({ ...projectStore.project, ...updatedProject })
    layoutStore.openToast({
      message: t('settings.projectData.projectDataUpdateSuccess'),
      type: 'success'
    })
  } catch (error) {
    layoutStore.openToast({
      message: t('settings.projectData.projectDataUpdateError'),
      type: 'error'
    })
  } finally {
    loading.value = false
  }
}

// Watch selectedProjectId and reload project/tasks data when it changes
// This ensures data is always fresh when navigating between board/settings for the same project
watch(
  () => projectStore.selectedProjectId,
  (newId) => {
    if (newId) {
      queryClient.invalidateQueries({ queryKey: ['project', newId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', newId] })
    }
  }
)

// Use project data from Pinia store
const projectStoreProject = computed(() => projectStore.project)
const projectName = computed({
  get: () => projectStoreProject.value.name || '',
  set: (value) => {
    projectStoreProject.value.name = value
  }
})

const projectDescription = computed({
  get: () => projectStoreProject.value.description || '',
  set: (value) => {
    projectStoreProject.value.description = value
  }
})
</script>

<template>
  <div class="flex flex-col gap-6 p-6 bg-gradient-to-br from-primary to-secondary to-80% min-h-screen">
    <div v-if="invalidProjectId" class="alert alert-error shadow-lg mb-4">
      <span>Invalid project ID in settings view.</span>
    </div>
    <div v-else-if="loading" class="flex justify-center items-center h-full">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
    <div v-else class="flex flex-col lg:flex-row gap-6 w-full">
      <!-- Left column: Project card and Danger Zone -->
      <div class="flex flex-col gap-6 flex-1 min-w-[320px] max-w-lg">
        <!-- Project Card -->
        <div class="card bg-base-100 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg font-bold mb-2">Project</h2>
            <!-- Name Field -->
            <div class="flex flex-col items-start gap-1 w-full mb-4">
              <label for="projectName" class="text-base font-semibold">{{$t('settings.projectData.name')}}</label>
              <BaseInput
              id="projectName"
              v-model="projectName"
              name="projectName"
              :label="null"
              :placeholder="$t('settings.projectData.enterProjectName')"
              :floatLabel="false"
              :rules="[
                (value: string) => !!value || $t('settings.projectData.nameRequired'),
                (value: string) => (typeof value === 'string' && value.length >= 3) || $t('settings.projectData.nameMin'),
                (value: string) => (typeof value === 'string' && value.length <= 60) || $t('settings.projectData.nameMax')
              ]"
              class="w-full"
            />
            <!-- Debug info -->
            <div class="text-xs mt-1">
              Debug: projectName = {{ projectName }}
            </div>
            </div>
            <!-- Description Field -->
            <div class="flex flex-col gap-2 w-full">
              <label for="projectDescription" class="text-base font-semibold">{{$t('settings.projectData.description')}}</label>
              <textarea
                id="projectDescription"
                v-model="projectDescription"
                name="projectDescription"
                :placeholder="$t('settings.projectData.enterProjectDescription')"
                maxlength="1000"
                class="textarea textarea-bordered w-full min-h-[120px] h-28"
              ></textarea>
              <!-- Debug info -->
              <div class="text-xs mt-1">
                Debug: projectDescription = {{ projectDescription }}
              </div>
            </div>
            <div class="flex justify-end mt-4">
              <BaseButton
                :label="$t('settings.projectData.saveChanges')"
                icon="check"
                :disabled="loading"
                @click="saveProjectData"
              />
            </div>
          </div>
        </div>
        <!-- Danger Zone Card -->
        <div class="card bg-base-100 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg font-bold text-error mb-2">{{$t('settings.dangerZone.title')}}</h2>
            <DangerZone />
          </div>
        </div>
      </div>
      <!-- Main area: Columns card -->
      <div class="card bg-base-100 shadow-md flex-[2] min-w-[340px]">
        <div class="card-body">
          <h2 class="card-title text-lg font-bold mb-2">{{$t('settings.columns.title')}}</h2>
    <ColumnsSection :columns="projectStoreProject.columns || []" :project-id="projectId" />
        </div>
      </div>
    </div>
  </div>
</template>
