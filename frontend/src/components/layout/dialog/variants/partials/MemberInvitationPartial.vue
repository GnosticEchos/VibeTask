<script setup lang="ts">
import { roles } from '@/const'
import { useLayoutStore } from '@/stores/layout'
import { useMembersStore } from '@/stores/members'
import { useProjectStore } from '@/stores/project'
import { iMemberItem } from '@/types/userTypes'
import rules from '@/utils/validators'
import { computed, PropType, Ref, ref } from 'vue'
// import { useI18n } from 'vue-i18n'

const emit = defineEmits(['inviteMembers', 'update:members'])

const props = defineProps({
  members: {
    type: Array as PropType<iMemberItem[]>,
    required: true,
  },
})
const projectStore = useProjectStore()
const membersStore = useMembersStore()
const layoutStore = useLayoutStore()

// const { t } = useI18n()

const foundMember: Ref<iMemberItem | null> = ref(null)
const memberEmail: Ref<string> = ref('')

const loading = computed(() => {
  return membersStore.loadingItem
})

const addFoundMember = () => {
  emit('update:members', [
    ...props.members,
    { ...foundMember.value, role: 'Editor' },
  ])
  memberEmail.value = ''
  foundMember.value = null
}

const removeFoundMember = (index: number) => {
  const members = [...props.members]
  members.splice(index, 1)
  emit('update:members', members)
}

const searchEmail = async () => {
  if (!memberEmail.value || rules.email(memberEmail.value) !== true) {
    foundMember.value = null
    return
  }

  try {
    const params = {
      email: memberEmail.value,
      projectId: projectStore.project?.id as number,
    }
    foundMember.value = await membersStore.checkMemberEmail(params)
    addFoundMember()
  } catch (_err) {
    layoutStore.openToast({ message: 'Member invitation error. Please try again.', type: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col flex-wrap px-4 pt-4 w-full">
    <span class="field-label">{{ $t('members.findMemberByEmail') }}</span>
    <div class="flex w-full">
      <div class="card w-full">
        <BaseInput
          v-model="memberEmail"
          name="memberEmail"
          :label="$t('members.enterUserEmail')"
          class="w-full"
          :disabled="loading"
          :placeholder="$t('members.enterUserEmail')"
          :rules="[rules.email]"
        />
      </div>
      <BaseButton
        @click="searchEmail"
        class="ml-2"
        :icon="loading ? 'spinner' : 'search'"
        large
        :spin="loading"
        :disabled="
          !memberEmail ||
          loading ||
          members.some((member) => member.email === memberEmail)
        "
      />
    </div>
    <span v-if="members.length" class="field-label mb-2">{{
      $t('members.membersToBeInvited')
    }}</span>
    <div v-if="members.length" class="members-list">
      <div v-for="(member, index) in members" :key="member.id" class="member">
        <div class="flex items-center">
          <img :src="member.avatarUrl" class="member__avatar" alt="Member avatar" />
          <!-- TODO: Replace with DaisyUI Tooltip -->
          <span class="member__email">{{ member.email }}</span>
        </div>
        <div class="flex">
          <BaseSelect
            v-model="member.role"
            :name="`memberRole_${index}`"
            :items="roles"
            :label="$t('members.role')"
            :placeholder="$t('members.selectRole')"
          />
          <button
            type="button"
            class="btn btn-ghost btn-xs p-1 ml-3 self-center"
            aria-label="Remove member"
            @click="removeFoundMember(index)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
