<template>
  <div>
    <h3 class="font-bold text-lg mb-2">Theme Switcher</h3>
    <div class="mb-4">
      <div>Previous Theme: <span class="badge badge-outline">{{ previousTheme }}</span></div>
      <div>Current Theme: <span class="badge badge-primary">{{ currentTheme }}</span></div>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <button v-for="theme in themes" :key="theme" class="btn btn-sm w-full" :class="{ 'btn-primary': theme === currentTheme }" @click="applyTheme(theme)">{{ theme }}</button>
    </div>
    <div class="modal-action">
      <button class="btn" @click="close">Close</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '@/stores/themeStore'
// import { daisyPalettes } from '@/components/preferences/daisyPalettes'
// import { usePlaygroundStore } from '@/stores/playgroundStore'
const emit = defineEmits(['close'])
const themeStore = useThemeStore()
const previousTheme = ref(themeStore.themeName)
const currentTheme = ref(themeStore.themeName)
const themes = [
  'CustomLight', 'CustomDark', 'Random',
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade', 'night', 'coffee', 'winter', 'dim', 'nord', 'sunset', 'caramellatte', 'abyss', 'silk'
]

// function isPaletteEmpty(palette: any) {
//   // Consider a palette empty if all values are #ffffff or the object is empty
//   const values = Object.values(palette || {});
//   if (values.length === 0) return true;
//   return values.every(v => v.toLowerCase() === '#ffffff');
// }

function applyTheme(theme: string) {
  previousTheme.value = currentTheme.value
  currentTheme.value = theme
  if (theme === 'CustomLight' || theme === 'customlight') {
    // Only activate, do not overwrite palette
    themeStore.setTheme('customlight')
    console.log('[ThemeSwitcher] Activated CustomLight')
    setTimeout(() => {
      console.log('[ThemeSwitcher][DEBUG] themeStore.name:', themeStore.name)
      console.log('[ThemeSwitcher][DEBUG] themeStore.palette:', themeStore.palette)
      console.log('[ThemeSwitcher][DEBUG] data-theme:', document.documentElement.getAttribute('data-theme'))
    }, 100)
    return
  }
  if (theme === 'CustomDark' || theme === 'customdark') {
    themeStore.setTheme('customdark')
    console.log('[ThemeSwitcher] Activated CustomDark')
    setTimeout(() => {
      console.log('[ThemeSwitcher][DEBUG] themeStore.name:', themeStore.name)
      console.log('[ThemeSwitcher][DEBUG] themeStore.palette:', themeStore.palette)
      console.log('[ThemeSwitcher][DEBUG] data-theme:', document.documentElement.getAttribute('data-theme'))
    }, 100)
    return
  }
  if (theme === 'Random' || theme === 'random') {
    themeStore.setTheme('random');
    console.log('[ThemeSwitcher] Activated Random')
    setTimeout(() => {
      console.log('[ThemeSwitcher][DEBUG] themeStore.name:', themeStore.name)
      console.log('[ThemeSwitcher][DEBUG] themeStore.palette:', themeStore.palette)
      console.log('[ThemeSwitcher][DEBUG] data-theme:', document.documentElement.getAttribute('data-theme'))
    }, 100)
    return;
  }
  themeStore.setTheme(theme.toLowerCase())
  setTimeout(() => {
    console.log('[ThemeSwitcher][DEBUG] themeStore.name:', themeStore.name)
    console.log('[ThemeSwitcher][DEBUG] themeStore.palette:', themeStore.palette)
    console.log('[ThemeSwitcher][DEBUG] data-theme:', document.documentElement.getAttribute('data-theme'))
  }, 100)
}
function close() {
  emit('close')
}
function escListener(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('keydown', escListener)
})
onUnmounted(() => {
  document.removeEventListener('keydown', escListener)
})
</script> 