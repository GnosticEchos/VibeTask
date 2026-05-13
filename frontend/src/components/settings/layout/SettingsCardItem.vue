<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SettingsLayoutCardPlacement } from '@/types/settingsLayoutTypes'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/vue/16/solid'

const props = defineProps<{
  card: SettingsLayoutCardPlacement
  editable?: boolean
  isDragOver?: boolean
  isDragging?: boolean
  /** When set, the article gets this id (for in-page navigation). */
  scrollAnchorId?: string
  /**
   * Parent uses vue-grid-layout (absolute tiles). Disable native HTML5 drag and CSS grid placement on this shell.
   */
  externalLayout?: boolean
}>()

const emit = defineEmits<{
  dragStart: [id: string]
  dragEnd: []
  dragOver: [id: string]
  dropOnCard: [id: string]
  resizeCard: [id: string, delta: number]
  contentHeight: [id: string, heightPx: number]
}>()

const contentRef = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

function measureContentHeight() {
  const el = contentRef.value
  if (!el) return
  emit('contentHeight', props.card.id, Math.ceil(el.scrollHeight))
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && contentRef.value) {
    observer = new ResizeObserver(() => measureContentHeight())
    observer.observe(contentRef.value)
  }
  nextTick(measureContentHeight)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(
  () => [props.card.id, props.editable],
  () => nextTick(measureContentHeight),
)
</script>

<template>
  <article
    :id="scrollAnchorId || undefined"
    :data-settings-card-id="card.id"
    class="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible rounded-xl transition-all"
    :class="[
      isDragOver ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-transparent' : '',
      isDragging ? 'opacity-70 saturate-75' : '',
      props.scrollAnchorId ? 'scroll-mt-24' : '',
    ]"
    :draggable="Boolean(editable) && !externalLayout"
    :style="
      externalLayout
        ? undefined
        : {
            gridColumn: `${card.x + 1} / span ${card.w}`,
            gridRow: `${card.y + 1} / span ${card.h}`,
          }
    "
    @dragstart.stop="$emit('dragStart', card.id)"
    @dragend="$emit('dragEnd')"
    @dragover.prevent="$emit('dragOver', card.id)"
    @drop.stop.prevent="$emit('dropOnCard', card.id)"
  >
    <div
      v-if="editable"
      class="absolute left-2 top-2 z-10 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100/90 px-2 py-1 text-xs text-base-content/70 shadow-sm"
      aria-label="Drag handle"
      title="Drag card"
    >
      <span class="cursor-move select-none">≡</span>
      <span class="select-none">Layout</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs px-1"
        @click.stop="$emit('resizeCard', card.id, -1)"
        title="Narrower"
        aria-label="Decrease card width"
      >
        <ChevronLeftIcon class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-xs px-1"
        @click.stop="$emit('resizeCard', card.id, 1)"
        title="Wider"
        aria-label="Increase card width"
      >
        <ChevronRightIcon class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>

    <div
      ref="contentRef"
      class="flex flex-col overflow-visible"
      :class="editable ? 'pt-9' : ''"
    >
      <slot />
    </div>
  </article>
</template>

