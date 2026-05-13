import { defineStore } from 'pinia';
import { ref } from 'vue';

// Helper: DaisyUI roles
const DAISY_ROLES = [
  'primary', 'primary-content',
  'secondary', 'secondary-content',
  'accent', 'accent-content',
  'neutral', 'neutral-content',
  'base-100', 'base-200', 'base-300', 'base-content',
  'info', 'info-content',
  'success', 'success-content',
  'warning', 'warning-content',
  'error', 'error-content',
];

type Palette = Record<string, string>;

function makeDefaultPalette(color = '#ffffff'): Palette {
  const palette: Palette = {};
  DAISY_ROLES.forEach(role => { palette[role] = color; });
  return palette;
}

export const usePlaygroundStore = defineStore('playground', () => {
  const lightPalette = ref<Palette>(makeDefaultPalette());
  const darkPalette = ref<Palette>(makeDefaultPalette());
  const randomPalette = ref<Palette>(makeDefaultPalette());
  // Store originals for modification detection
  const originalLightPalette = ref<Palette>(makeDefaultPalette());
  const originalDarkPalette = ref<Palette>(makeDefaultPalette());

  function setLightPalette(palette: Palette, setOriginal = false) {
    lightPalette.value = { ...palette };
    if (setOriginal) originalLightPalette.value = { ...palette };
  }
  function setDarkPalette(palette: Palette, setOriginal = false) {
    darkPalette.value = { ...palette };
    if (setOriginal) originalDarkPalette.value = { ...palette };
  }
  function setRandomPalette(palette: Palette) {
    randomPalette.value = { ...palette };
  }
  function resetPalettes() {
    lightPalette.value = makeDefaultPalette();
    darkPalette.value = makeDefaultPalette();
    randomPalette.value = makeDefaultPalette();
    originalLightPalette.value = makeDefaultPalette();
    originalDarkPalette.value = makeDefaultPalette();
  }

  return {
    lightPalette,
    darkPalette,
    randomPalette,
    originalLightPalette,
    originalDarkPalette,
    setLightPalette,
    setDarkPalette,
    setRandomPalette,
    resetPalettes,
  };
}); 