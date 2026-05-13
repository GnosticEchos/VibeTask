<script setup lang="ts">
import type { iComment, iTaskLog } from '@/types/taskTypes'

defineProps<{
  comments: iComment[]
  history: iTaskLog[]
  commentText: string
  addingComment?: boolean
  addCommentError?: string
  getCommentAuthorDisplayName: (comment: iComment) => string
}>()

defineEmits<{
  'update:commentText': [value: string]
  addComment: []
}>()
</script>

<template>
  <section class="collapse collapse-arrow rounded-box border border-base-300 bg-base-100">
    <input type="checkbox" />
    <div class="collapse-title">
      <h3 class="font-semibold">
        {{ $t('tasks.activity') }}
        <span class="badge badge-sm ml-2">{{ $t('taskDialog.commentCount', { count: comments.length }) }}</span>
      </h3>
      <p class="text-xs text-base-content/60">{{ $t('taskDialog.activityHint') }}</p>
    </div>

    <div class="collapse-content">
      <ul class="space-y-2">
        <li v-for="comment in comments" :key="comment.id || comment.tempId" class="rounded bg-base-200/60 p-2 text-sm">
          <span class="font-medium">{{ getCommentAuthorDisplayName(comment) }}:</span>
          <span class="ml-1">{{ comment.content || '' }}</span>
          <span v-if="comment.optimistic" class="ml-2 text-xs text-warning">{{ $t('taskDialog.sending') }}</span>
        </li>
        <li v-if="!comments.length" class="text-sm italic text-base-content/60">{{ $t('taskDialog.noComments') }}</li>
      </ul>

      <textarea
        :value="commentText"
        class="textarea textarea-bordered textarea-sm mt-3 w-full"
        :placeholder="$t('taskDialog.addCommentPlaceholder')"
        :readonly="addingComment"
        :aria-label="$t('taskDialog.addCommentPlaceholder')"
        @input="$emit('update:commentText', ($event.target as HTMLTextAreaElement).value)"
      />
      <button
        class="btn btn-primary btn-xs mt-2"
        type="button"
        :disabled="addingComment || !commentText"
        @click="$emit('addComment')"
      >
        <span v-if="addingComment" class="loading loading-spinner loading-xs" />
        <span v-else>{{ $t('taskDialog.addComment') }}</span>
      </button>
      <div v-if="addCommentError" class="mt-1 text-xs text-error">{{ addCommentError }}</div>

      <div class="collapse collapse-arrow mt-3 bg-base-200/60" aria-label="Task history">
        <input type="checkbox" />
        <div class="collapse-title text-sm font-semibold">
          {{ $t('tasks.history') }}
          <span class="badge badge-sm ml-2">{{ history.length }}</span>
        </div>
        <div class="collapse-content">
        <ul class="space-y-1">
          <li v-for="log in history" :key="log.id" class="text-xs">
            <span class="text-base-content/60">{{ log.createdAt }}:</span>
            <span class="ml-1">{{ log.text }}</span>
          </li>
          <li v-if="!history.length" class="text-sm italic text-base-content/60">{{ $t('taskDialog.noHistory') }}</li>
        </ul>
        </div>
      </div>
    </div>
  </section>
</template>
