<script setup lang="ts">
import { ref } from 'vue'
import type { iComment, iTask } from '@/types/taskTypes'

defineProps<{
  task: iTask
  comments: iComment[]
}>()

const emit = defineEmits<{
  addComment: [content: string]
}>()

const commentText = ref('')
const isSubmitting = ref(false)

function getCommentAuthorDisplayName(comment: iComment): string {
  return comment.user?.fullName || comment.createdBy?.fullName || 'Unknown'
}

async function submitComment() {
  if (!commentText.value.trim()) return
  isSubmitting.value = true
  emit('addComment', commentText.value)
  commentText.value = ''
  isSubmitting.value = false
}
</script>

<template>
  <div class="collapse collapse-arrow bg-base-200" aria-label="Task comments">
    <input type="checkbox" />
    <div class="collapse-title font-semibold">
      Comments ({{ comments.length }})
    </div>
    <div class="collapse-content">
      <ul class="space-y-2">
        <li
          v-for="comment in comments"
          :key="comment.id || comment.tempId"
          class="bg-base-200 rounded p-2"
        >
          <span class="font-medium">{{ getCommentAuthorDisplayName(comment) }}:</span>
          <span class="ml-1">{{ comment.content || '' }}</span>
          <span v-if="comment.optimistic" class="ml-2 text-xs text-warning">(sending...)</span>
        </li>
        <li v-if="!comments.length" class="text-base-content/60 italic">
          No comments yet.
        </li>
      </ul>
      <textarea
        v-model="commentText"
        class="textarea textarea-bordered textarea-xs w-full mt-2"
        placeholder="Add a comment..."
        :readonly="isSubmitting"
        aria-label="Add a comment"
      ></textarea>
      <button
        class="btn btn-xs btn-primary mt-1"
        :disabled="isSubmitting || !commentText.trim()"
        @click="submitComment"
      >
        Add Comment
      </button>
    </div>
  </div>
</template>
