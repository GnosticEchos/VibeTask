<script setup lang="ts">
import { ref, watch } from 'vue'
import { GridLayout, GridItem } from 'vue-grid-layout-v3'
import type { SettingsLayoutCardPlacement, SettingsLayoutPage } from '@/types/settingsLayoutTypes'
import SettingsCardItem from '@/components/settings/layout/SettingsCardItem.vue'
import { cardConstraint, clampCardsToConstraints } from '@/utils/settingsLayoutNormalize'

/** Layout entry for vue-grid-layout-v3 (persisted data maps via `i` ↔ `id`). */
type SettingsVglItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
  static?: boolean
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
}

const props = defineProps<{
  layout: SettingsLayoutPage
  editable?: boolean
  cardScrollAnchorPrefix?: string
}>()

function scrollAnchorIdForCard(cardId: string): string | undefined {
  if (!props.cardScrollAnchorPrefix) return undefined
  return `${props.cardScrollAnchorPrefix}-card-${cardId.replace(/\./g, '-')}`
}

const emit = defineEmits<{
  layoutChange: [next: SettingsLayoutPage]
}>()

const GRID_ROW_HEIGHT = 40
const GRID_MARGIN: [number, number] = [6, 6]

const vglLayout = ref<SettingsVglItem[]>([])
const measuredContentHeights = ref<Record<string, number>>({})

function rowsForContentHeight(cardId: string, heightPx: number, columns: number): number {
  const { minH, maxH } = cardConstraint(cardId, columns)
  const verticalMargin = GRID_MARGIN[1]
  const rows = Math.ceil((heightPx + verticalMargin + 2) / (GRID_ROW_HEIGHT + verticalMargin))
  return Math.max(minH, Math.min(maxH, rows))
}

function toVglItems(cards: SettingsLayoutCardPlacement[], columns: number, editable: boolean): SettingsVglItem[] {
  return cards.map((c) => {
    const { minW, maxW, minH, maxH } = cardConstraint(c.id, columns)
    const w = Math.max(minW, Math.min(maxW, c.w))
    const measuredHeight = measuredContentHeights.value[c.id]
    const h = measuredHeight
      ? rowsForContentHeight(c.id, measuredHeight, columns)
      : Math.max(minH, Math.min(maxH, c.h))
    const x = Math.max(0, Math.min(columns - w, c.x))
    return {
      i: c.id,
      x,
      y: Math.max(0, c.y),
      w,
      h,
      static: !editable,
      minW,
      maxW,
      minH,
      maxH,
    }
  })
}

function fromVglItems(items: SettingsVglItem[]): SettingsLayoutCardPlacement[] {
  return items.map((it) => ({
    id: String(it.i),
    x: it.x,
    y: it.y,
    w: it.w,
    h: it.h,
  }))
}

function layoutSignature(items: SettingsVglItem[]): string {
  return [...items]
    .map((it) => `${it.i}:${it.x},${it.y},${it.w},${it.h}`)
    .sort()
    .join('|')
}

watch(
  () => props.layout.cards,
  (cards) => {
    const columns = props.layout.grid.columns
    const editable = Boolean(props.editable)
    const incoming = toVglItems(cards, columns, editable)
    if (layoutSignature(incoming) !== layoutSignature(vglLayout.value)) {
      vglLayout.value = incoming
    }
  },
  { deep: true, immediate: true },
)

watch(
  () => props.editable,
  (editable) => {
    const ed = Boolean(editable)
    vglLayout.value = vglLayout.value.map((it) => ({ ...it, static: !ed }))
  },
)

function handleGridLayoutUpdate(next: SettingsVglItem[]) {
  vglLayout.value = next
  const columns = props.layout.grid.columns
  const cards = clampCardsToConstraints(fromVglItems(next), columns)
  emit('layoutChange', {
    ...props.layout,
    cards,
  })
}

function placementForItem(item: SettingsVglItem): SettingsLayoutCardPlacement {
  const base = props.layout.cards.find((c) => c.id === item.i)
  return {
    id: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    hidden: base?.hidden,
  }
}

function handleResizeCard(id: string, delta: number) {
  if (!props.editable || !delta) return
  const col = props.layout.grid.columns
  const idx = vglLayout.value.findIndex((x) => x.i === id)
  if (idx === -1) return
  const item = vglLayout.value[idx]
  const { minW, maxW } = cardConstraint(id, col)
  const nextW = Math.max(minW, Math.min(maxW, item.w + delta))
  const maxX = Math.max(0, col - nextW)
  const nextX = Math.min(item.x, maxX)
  const next = vglLayout.value.map((it, i) => (i === idx ? { ...it, w: nextW, x: nextX } : it))
  handleGridLayoutUpdate(next)
}

function handleContentHeight(id: string, heightPx: number) {
  if (!heightPx) return
  const columns = props.layout.grid.columns
  measuredContentHeights.value = { ...measuredContentHeights.value, [id]: heightPx }
  const idx = vglLayout.value.findIndex((x) => x.i === id)
  if (idx === -1) return
  const item = vglLayout.value[idx]
  const nextH = rowsForContentHeight(id, heightPx, columns)
  if (nextH === item.h) return
  const next = vglLayout.value.map((it, i) => (i === idx ? { ...it, h: nextH } : it))
  handleGridLayoutUpdate(next)
}
</script>

<template>
  <div class="settings-draggable-root pt-1 pb-8">
    <GridLayout
      :layout="vglLayout"
      :col-num="layout.grid.columns"
      :row-height="GRID_ROW_HEIGHT"
      :margin="GRID_MARGIN"
      :is-draggable="Boolean(editable)"
      :is-resizable="false"
      :vertical-compact="true"
      :use-css-transforms="true"
      :responsive="false"
      class="settings-vue-grid-layout min-h-[120px]"
      @update:layout="handleGridLayoutUpdate"
    >
      <GridItem
        v-for="item in vglLayout"
        :key="item.i"
        :x="item.x"
        :y="item.y"
        :w="item.w"
        :h="item.h"
        :i="item.i"
        :min-w="item.minW"
        :max-w="item.maxW"
        :min-h="item.minH"
        :max-h="item.maxH"
        :static="item.static"
        class="settings-vue-grid-item"
        drag-ignore-from="a, button, input, select, textarea"
      >
        <SettingsCardItem
          :card="placementForItem(item)"
          :scroll-anchor-id="scrollAnchorIdForCard(item.i)"
          :editable="editable"
          external-layout
          @resize-card="handleResizeCard"
          @content-height="handleContentHeight"
        >
          <slot :card-id="item.i" />
        </SettingsCardItem>
      </GridItem>
    </GridLayout>
  </div>
</template>

<style scoped>
.settings-draggable-root :deep(.settings-vue-grid-layout.vue-grid-layout) {
  position: relative;
}

/* Match settings cards; library placeholder while dragging */
.settings-draggable-root :deep(.vue-grid-item.vue-grid-placeholder) {
  border-radius: 0.75rem;
  background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  border: 2px dashed color-mix(in oklab, var(--color-primary) 50%, transparent);
  opacity: 1;
}

.settings-draggable-root :deep(.settings-vue-grid-item.vue-grid-item:not(.vue-grid-placeholder)) {
  border-radius: 0.75rem;
}

.settings-draggable-root :deep(.settings-vue-grid-item .vue-resizable-handle) {
  opacity: 0.85;
  z-index: 20;
}
</style>
