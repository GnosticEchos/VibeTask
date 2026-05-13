<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import api from '@/api/v1/indexApi'
import { computed } from 'vue'
import type { iMemberItem } from '@/types/userTypes'
import { isValidId } from '@/utils/validation'

const props = defineProps<{
  projectId: number
}>()

const { workspaceMode } = useSettingsPermissions()

const hasProjectSelected = computed(() => isValidId(props.projectId))

const membersQuery = useQuery({
  queryKey: computed(() => ['members', props.projectId]),
  queryFn: () => api.getItems<iMemberItem>('members', { projectId: props.projectId }),
  enabled: hasProjectSelected,
})

const members = computed((): iMemberItem[] =>
  Array.isArray(membersQuery.data.value) ? membersQuery.data.value : [],
)

const showInitialLoading = computed(
  () => membersQuery.isLoading.value && !membersQuery.isFetched.value,
)

function memberDisplayName(member: { fullName?: string; name?: string; surname?: string }) {
  if (member.fullName?.trim()) return member.fullName
  return [member.name, member.surname].filter(Boolean).join(' ').trim() || '—'
}
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.workspace.membersTitle')"
    :subtitle="$t('settingsHub.workspace.membersSubtitle')"
    :mode="workspaceMode"
  >
    <div class="overflow-x-auto">
      <div v-if="!hasProjectSelected" class="rounded-lg border border-base-300/80 bg-base-200/70 px-3 py-2 text-sm text-base-content/80">
        {{ $t('settingsHub.workspace.noProjectSelected') }}
      </div>
      <div v-else-if="showInitialLoading" class="flex justify-center py-6">
        <span class="loading loading-spinner loading-md" :aria-label="$t('settingsHub.workspace.membersLoadingAria')" />
      </div>
      <div v-else-if="membersQuery.isError.value" class="alert alert-error">
        <span>{{ $t('settingsHub.workspace.membersLoadError') }}</span>
      </div>
      <table v-else class="table table-zebra table-sm">
        <thead>
          <tr>
            <th>{{ $t('settingsHub.workspace.memberName') }}</th>
            <th>{{ $t('settingsHub.workspace.memberEmail') }}</th>
            <th>{{ $t('settingsHub.workspace.memberRole') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="members.length === 0">
            <td colspan="3">{{ $t('settingsHub.workspace.noMembers') }}</td>
          </tr>
          <tr v-for="member in members" :key="member.id">
            <td>{{ memberDisplayName(member) }}</td>
            <td>{{ member.email || '—' }}</td>
            <td>{{ member.role || 'Viewer' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </SettingsCard>
</template>
