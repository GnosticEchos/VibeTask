<script setup lang="ts">
import { iComment } from '@/types/taskTypes'
import { ref } from 'vue'

const childRef = ref(null)
defineExpose({ childRef })

defineProps({
  comments: {
    type: Array as () => iComment[],
    required: true,
  },
})
</script>

<template>
  <div ref="childRef" class="comments-wrapper mb-2">
    <div
      v-for="comment in comments"
      :key="comment.id"
      class="comment flex mb-2 items-start"
    >
      <img :src="comment.user.avatarUrl" class="comment__avatar mr-3" alt="Comment user avatar" />
      <div class="comment__content flex flex-col py-2 px-3">
        <span class="comment__user">{{ comment.user?.fullName }}</span>
        <span v-html="comment.content" class="comment__text mt-1" />
      </div>
    </div>
  </div>
</template>
