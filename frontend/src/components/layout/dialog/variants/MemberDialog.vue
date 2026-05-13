<script setup lang="ts">
import DialogTemplate from '@/components/layout/dialog/DialogTemplate.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDoubleClickSelect from '@/components/base/BaseDoubleClickSelect.vue'
import usePermittedUser from '@/composables/usePermittedUser'
import { roles } from '@/const'
import { useAuthStore } from '@/stores/auth'
import { useLayoutStore } from '@/stores/layout'
import { useMembersStore } from '@/stores/members'
import { useProjectStore } from '@/stores/project'
import { useWebsocketStore } from '@/stores/websocket'
import { iMemberItem } from '@/types/userTypes'
import { formatDate, getDisplayName } from '@/utils/functions'
import { uiLog } from '@/utils/logger'
import {
  computed,
  onBeforeMount,
  onMounted,
  onUnmounted,
  reactive,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

const layoutStore = useLayoutStore()
const membersStore = useMembersStore()
const projectStore = useProjectStore()
const websocketStore = useWebsocketStore()
const authStore = useAuthStore()

const { t } = useI18n()

const projectId = computed(() => projectStore.project?.id)

/* -------------------------------- ON DIALOG OPEN --------------------------------- */
/* ------------------------- fetch member and connect to WS -------------------------- */
const dialogItem = computed<iMemberItem>(() => layoutStore.dialog.item)

onBeforeMount(() => {
  websocketStore.joinChannel('MemberIndexChannel', {
    projectId: projectStore.project?.id,
    memberId: dialogItem.value.id,
  })
})

onMounted(async () => {
  await membersStore.getItem(dialogItem.value.id)
})

watch(
  () => dialogItem?.value?.id,
  async () => {
    if (member?.value?.id) {
      websocketStore.leaveChannel('MemberIndexChannel')
      websocketStore.joinChannel('MemberIndexChannel', {
        projectId: projectStore.project?.id,
        memberId: dialogItem.value.id,
      })
    }
  },
)

onUnmounted(() => {
  websocketStore.leaveChannel('MemberIndexChannel')
})

/* ------------------------------ ACCESS NEEDED DATA ------------------------------- */

const member = computed<iMemberItem>(() => {
  return membersStore.item
})

const { isAdmin, userRole } = usePermittedUser()

/* ------------------------------ INITIALIZE LOCAL STATE ------------------------------- */
const fieldsEditingState: {
  [key: string]: boolean
} = reactive({
  role: false,
})

const fieldsValueState: {
  [key: string]: string | null
} = reactive({
  role: null,
})

/* ------------------------------ LOCAL STATE SETTERS ------------------------------- */
/* - State management for the base inputs has been extracted from their components -- */
/* ----- this was done to enable potential manipulation from a parent component ----- */

const updateFieldValue = (value: string, key: string) => {
  fieldsValueState[key] = value
}

/* ------------------------------ FUNCTIONS ------------------------------- */
const submitFieldValue = async (key: string) => {
  try {
    const params = {
      [key]: fieldsValueState[key],
    }
    await membersStore.updateItem(member.value.id, params)
    fieldsEditingState[key] = false

    if (member.value.id === authStore.user.id) {
      // TODO: Implement project refresh logic here if needed
    }
  } catch (error) {
    uiLog.error('MemberDialog error', { error })
    throw error
  }
}

async function removeMember() {
  try {
    await membersStore.deleteMember(projectId.value, member.value.id)
    layoutStore.closeDialog()
    layoutStore.openToast({ message: t('members.memberRemoved'), type: 'success' })
  } catch (error) {
    uiLog.error('removeMember error', { error })
  }
}

/* -------------------------------- UTILS --------------------------------- */
const isMemberOwner = computed(() => {
  return userRole.value === 'Owner' && member.value.id === authStore.user.id
})

const isPermittedToRemoveMember = computed(() => {
  if (isMemberOwner.value) {
    return false
  }
  if (member.value.role === 'Maintainer' && userRole.value === 'Maintainer') {
    return false
  }
  return isAdmin.value
})

const isPermittedToEditRole = computed(() => {
  if (isMemberOwner.value) {
    return false
  }
  return isAdmin.value
})

const removeMemberPermissionTooltipCaption = computed(() => {
  if (isMemberOwner.value) {
    return t('members.removeSelfMemberPermissionError')
  }
  if (member.value.role === 'Maintainer' && userRole.value === 'Maintainer') {
    return t('members.removeMaintainerAsMaintainerError')
  }
  if (!isAdmin.value) {
    return t('members.removeMemberError')
  }
  return ''
})

// const editRoleTooltipCaption = computed(() => {
//   if (isMemberOwner.value) {
//     return t('members.editSelfOwnerRoleError')
//   }
//   if (!isAdmin.value) {
//     return t('members.editMemberRoleError')
//   }
//   return ''
// })
</script>

<template>
  <DialogTemplate hideActions :loading="membersStore.loadingItem">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <span>{{ $t('members.member') }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          :aria-label="$t('actions.close')"
          @click="layoutStore.closeDialog()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </template>
    <template #content>
      <div v-if="!member?.id" class="flex gap-4">
        <div class="skeleton h-16 w-16 rounded-full shrink-0" />
        <div class="flex-1 space-y-2">
          <div class="skeleton h-5 w-32" />
          <div class="skeleton h-4 w-48" />
        </div>
      </div>
      <div v-else class="flex">
        <div class="member__left-panel">
          <img :src="member.avatarUrl || ''" class="member__avatar" alt="Member avatar" />
          <span class="member__name">{{ getDisplayName(member) }}</span>
          <div class="tooltip tooltip-right mt-4 ml-2" :data-tip="removeMemberPermissionTooltipCaption || undefined">
            <BaseButton
              class="mt-4 ml-2"
              :label="$t('members.removeFromProject')"
              :disabled="!isPermittedToRemoveMember"
              @click="removeMember"
            />
          </div>
        </div>

        <div class="member__right-panel flex-grow-1">
          <BaseDoubleClickSelect
            fieldKey="role"
            :label="$t('members.role')"
            class="mb-2"
            :value="member.role"
            :isEditing="fieldsEditingState.role"
            :items="roles"
            optionsLabel=""
            optionsValue=""
            required
            :readonly="!isAdmin || !isPermittedToEditRole"
            :placeholder="$t('members.assignRoleToMember')"
            @setEditingState="fieldsEditingState.role = $event.value"
            @updateFieldValue="({ value, key }: any) => updateFieldValue(value, key)"
            @submitFieldValue="(key: string) => submitFieldValue(key)"
          />

          <BaseDoubleClickSelect
            class="mb-2"
            :label="$t('members.email')"
            :value="member.email"
            readonly
          />

          <BaseDoubleClickSelect
            :label="$t('members.createdAt')"
            :value="formatDate(member.createdAt)"
            readonly
          />
        </div>
      </div>
    </template>
  </DialogTemplate>
</template>
