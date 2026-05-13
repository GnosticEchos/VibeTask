<template>
  <div ref="modalRoot" class="modal-box w-full max-w-2xl" tabindex="-1">
    <header v-if="$slots.header" class="mb-4">
      <slot name="header" />
    </header>
    <section class="mb-4">
      <slot name="content" />
      <slot />
    </section>
    <footer v-if="$slots.actions" class="modal-action">
      <slot name="actions" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Ref } from 'vue'

const modalRoot: Ref<HTMLDivElement | null> = ref(null)
let lastActiveElement: Element | null = null

function getFocusableEls(): HTMLElement[] {
  if (!modalRoot.value) return []
  return Array.from(modalRoot.value.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el): el is HTMLElement => (el instanceof HTMLElement) && el.offsetParent !== null)
}

function focusFirstEl() {
  const els = getFocusableEls()
  if (els.length) {
    (els[0] as HTMLElement).focus()
  } else if (modalRoot.value) {
    (modalRoot.value as HTMLElement).focus()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    const els = getFocusableEls()
    if (!els.length) return
    const firstEl = els[0]
    const lastEl = els[els.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        (lastEl as HTMLElement).focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        (firstEl as HTMLElement).focus();
      }
    }
  }
  if (e.key === 'Escape') {
    // Try to emit close event if parent listens
    const evt = new CustomEvent('close', { bubbles: true })
    if (modalRoot.value) {
      modalRoot.value.dispatchEvent(evt)
    }
  }
}

onMounted(() => {
  lastActiveElement = document.activeElement
  nextTick(() => {
    focusFirstEl()
  })
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (lastActiveElement && typeof (lastActiveElement as HTMLElement).focus === 'function') {
    (lastActiveElement as HTMLElement).focus()
  }
})
</script>
