<script setup lang="ts">
import { ref, Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import BaseButton from '@/components/base/BaseButton.vue'
import ProjectSummaryCard from './ProjectSummaryCard.vue'
import type { ProjectStats } from '@/types/projectStatsTypes'
import { columnMainTaskCount } from '@/types/projectStatsTypes'
import type { iProject } from '@/types/projectTypes'
import BaseModal from '@/components/base/BaseModal.vue'
import type { ProjectsSummaryScope } from '@/composables/useProjectsSummaryQuery'

const props = defineProps<{ projects: ProjectStats[]; scope: ProjectsSummaryScope }>()

const router = useRouter()
const { t } = useI18n()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()

const selectedProject: Ref<ProjectStats | null> = ref(null)
const isModalVisible = ref(false)

const handleCardClick = (project: ProjectStats) => {
  selectedProject.value = project
  isModalVisible.value = true
}

const handleCardDoubleClick = (projectId: number) => {
  router.push(`/dashboard/project/${projectId}`)
}

const navigateToBoard = (projectId: number) => {
  router.push(`/dashboard/project/${projectId}`)
  isModalVisible.value = false
}

function statsToMinimalProject(stats: ProjectStats): iProject {
  return {
    id: stats.id,
    name: stats.name,
    description: stats.description ?? '',
    role: '',
    prefix: stats.prefix,
    members: [],
    columns: [],
    tasks: [],
  }
}

const openDeleteProjectDialog = () => {
  if (!selectedProject.value) return
  projectStore.setProject(statsToMinimalProject(selectedProject.value))
  layoutStore.openDialog({
    title: t('settings.dangerZone.deleteProject'),
    component: 'ConfirmProjectDeleteDialog',
    size: '600px',
  })
  isModalVisible.value = false
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 p-4 justify-start items-start">
    <div
      v-for="project in projects"
      :key="project.id"
    >
      <ProjectSummaryCard
        :project="project"
        :scope="scope"
        @click="handleCardClick(project)"
        @dblclick="handleCardDoubleClick(project.id)"
      />
    </div>
  </div>

  <BaseModal v-if="selectedProject" v-model="isModalVisible" :title="selectedProject.name">
    <p class="py-3 text-base-content/70">{{ selectedProject.description }}</p>

    <div class="divider my-2" />

    <div class="flex gap-2 flex-wrap mb-4">
      <span
        v-for="col in selectedProject.columns"
        :key="col.id"
        class="badge badge-outline p-3"
      >
        {{ col.name }}: {{ props.scope === 'all' ? (col.taskCountAll ?? col.taskCount ?? 0) : columnMainTaskCount(col) }}
      </span>
    </div>

    <template #actions>
      <BaseButton variant="primary" label="View Board" @click="navigateToBoard(selectedProject.id)" />
      <BaseButton
        variant="error"
        class="ml-2"
        :label="t('settings.dangerZone.deleteProject')"
        @click="openDeleteProjectDialog"
      />
    </template>
  </BaseModal>
</template>
