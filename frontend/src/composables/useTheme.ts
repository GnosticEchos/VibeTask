import { watch, onMounted } from 'vue';
import { useThemeStore } from '@/stores/themeStore';

export function useTheme() {
  const themeStore = useThemeStore();

  // Apply theme on startup
  onMounted(() => {
    themeStore.applyTheme();
  });

  // Watch for theme changes
  watch(
    () => themeStore.themeName,
    () => {
      themeStore.applyTheme();
    },
    { immediate: true }
  );

  // Expose theme switching and dark mode toggle
  return {
    themeStore,
    setTheme: themeStore.setTheme,
    toggleDarkMode: themeStore.toggleDarkMode,
    isDarkMode: themeStore.isDarkMode,
  };
} 