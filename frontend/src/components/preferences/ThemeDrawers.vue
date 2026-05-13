<template>
  <div class="theme-drawers">
    <details v-for="theme in themes" :key="theme.id" class="theme-drawer mb-2 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <summary class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-t cursor-pointer select-none">
        <span class="font-semibold">{{ theme.name }}</span>
        <svg class="transition-transform details-arrow" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="p-4 bg-white dark:bg-gray-900 rounded-b">
        <div class="flex gap-1 mb-2">
          <div v-for="color in theme.previewColors" :key="color" :style="{ background: color }" class="w-6 h-6 rounded border"></div>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1 bg-blue-500 text-white rounded text-sm" @click="$emit('select-theme', { theme, mode: 'light' })">Use Light</button>
          <button class="px-3 py-1 bg-gray-800 text-white rounded text-sm" @click="$emit('select-theme', { theme, mode: 'dark' })">Use Dark</button>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
const themes = [
  {
    id: 'dracula',
    name: 'Dracula',
    previewColors: ['#282a36', '#bd93f9', '#ff79c6', '#f8f8f2'],
    light: { primary: '#bd93f9', secondary: '#ff79c6', background: '#f8f8f2', surface: '#e2e2e2' },
    dark: { primary: '#bd93f9', secondary: '#ff79c6', background: '#282a36', surface: '#44475a' },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    previewColors: ['#002b36', '#b58900', '#268bd2', '#fdf6e3'],
    light: { primary: '#268bd2', secondary: '#b58900', background: '#fdf6e3', surface: '#eee8d5' },
    dark: { primary: '#268bd2', secondary: '#b58900', background: '#002b36', surface: '#073642' },
  },
  {
    id: 'nord',
    name: 'Nord',
    previewColors: ['#2e3440', '#88c0d0', '#5e81ac', '#eceff4'],
    light: { primary: '#5e81ac', secondary: '#88c0d0', background: '#eceff4', surface: '#e5e9f0' },
    dark: { primary: '#5e81ac', secondary: '#88c0d0', background: '#2e3440', surface: '#3b4252' },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    previewColors: ['#282828', '#fabd2f', '#b8bb26', '#fbf1c7'],
    light: { primary: '#b8bb26', secondary: '#fabd2f', background: '#fbf1c7', surface: '#ebdbb2' },
    dark: { primary: '#b8bb26', secondary: '#fabd2f', background: '#282828', surface: '#3c3836' },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    previewColors: ['#272822', '#a6e22e', '#f92672', '#f8f8f2'],
    light: { primary: '#a6e22e', secondary: '#f92672', background: '#f8f8f2', surface: '#e6e6e6' },
    dark: { primary: '#a6e22e', secondary: '#f92672', background: '#272822', surface: '#383830' },
  },
  {
    id: 'vibe',
    name: 'Vibe',
    previewColors: ['#1e293b', '#6366f1', '#fbbf24', '#f1f5f9'],
    light: { primary: '#6366f1', secondary: '#fbbf24', background: '#f1f5f9', surface: '#e0e7ef' },
    dark: { primary: '#6366f1', secondary: '#fbbf24', background: '#1e293b', surface: '#334155' },
  },
];
</script>

<style scoped>
.theme-drawer summary::-webkit-details-marker {
  display: none;
}

.theme-drawer[open] .details-arrow {
  transform: rotate(180deg);
}
</style>