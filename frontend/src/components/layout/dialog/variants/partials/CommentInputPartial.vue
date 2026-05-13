<script setup lang="ts">
import usePermittedUser from '@/composables/usePermittedUser'
import { useAuthStore } from '@/stores/auth'
import defaultUserAvatar from '@/assets/images/defaultUser.png'
import rules from '@/utils/validators'
import { computed } from 'vue'

const emit = defineEmits([
  'setEditingState',
  'updateValue',
  'submitValue',
  'showCommentInput',
])

const props = defineProps({
  value: {
    type: String,
    default: null,
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
})
const { isViewer } = usePermittedUser()

type emitValueType = {
  key: string
  value: string
}

type emitEditingStateType = {
  key: string
  value: boolean
}

const authStore = useAuthStore()

const formatedValue = computed(() => {
  return props.value?.replace(/<p><br><\/p>/g, '')
})

const commentHasNoValue = computed(() => {
  const noSpacesValue = formatedValue.value?.replace(/ /g, '')
  const emptyCommentPattern = /<p><\/p>(<p><\/p>)*$/
  return emptyCommentPattern.test(noSpacesValue)
})

const submitValueOnEnterKeyup = () => {
  if (formatedValue.value && !commentHasNoValue.value) {
    emit('submitValue', props.value)
  }
}
</script>

<template>
  <div class="comment-input-wrapper flex items-start">
    <img
      :src="authStore.user.avatarUrl || defaultUserAvatar"
      class="comment-input-wrapper__avatar mr-3 w-8 h-8 rounded-full object-cover"
    />
    <div class="w-full">
      <BaseDoubleClickInput
        :value="value"
        :isEditing="isEditing"
        :disabled="isViewer || !formatedValue || commentHasNoValue"
        valueKey="comment"
        :label="$t('tasks.comment')"
        :placeholder="$t('tasks.addNewComment')"
        :maxLength="1000"
        dense
        :tooltipConfig="{
          value: $t('tasks.dblClickToComment'),
          showDelay: 500,
        }"
        :rules="[(value:string) => rules.maxLength(value, 1000, $t('tasks.comment'))]"
        @setEditingState="(value: emitEditingStateType) => $emit('setEditingState', value)"
        @updateValue="(value: emitValueType) => $emit('updateValue', value)"
        @onEnterKeyup="submitValueOnEnterKeyup"
      >
        <div
          class="comment-input-wrapper__placeholder flex-1"
          :class="{ 'not-permitted': isViewer }"
          @dblclick="$emit('showCommentInput')"
        >
          <span>{{ $t('tasks.addNewComment') }}</span>
        </div>
      </BaseDoubleClickInput>
    </div>
  </div>
</template>

