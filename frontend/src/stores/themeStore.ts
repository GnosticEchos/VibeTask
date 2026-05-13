import { defineStore } from 'pinia';
import Color from 'color';
import { storeLog } from '@/utils/logger';
// // // import { computed } from 'vue';

// DaisyUI palette keys reference:
// primary, primary-content, secondary, secondary-content, accent, accent-content,
// neutral, neutral-content, base-100, base-200, base-content, info, success,
// warning, error

export interface DaisyPalette {
  [key: string]: string;
}

interface ThemeState {
  name: string; // data-theme attribute value, e.g. "CustomLight", "CustomDark", "Random", or DaisyUI built-in
  palette: DaisyPalette;
  customPalettes: Record<string, DaisyPalette>; // Mapping of custom theme names to palettes
}

const LOCAL_KEY_PALETTE = 'theme.palette';
const LOCAL_KEY_NAME = 'theme.name';
const LOCAL_KEY_CUSTOM_PALETTES = 'theme.customPalettes';
const THEME_NAMES_CUSTOM = ['customlight', 'customdark', 'random'];

// Daisy built-in themes list (complete)
const BUILT_IN_THEMES = [
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave',
  'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua',
  'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula',
  'cmyk', 'autumn', 'business', 'acid', 'lemonade', 'night', 'coffee', 'winter',
  'dim', 'nord', 'sunset', 'caramellatte', 'abyss', 'silk'
];
const DARK_THEMES = [
  'dark', 'night', 'dracula', 'black', 'luxury', 'synthwave', 'forest', 'coffee', 'dim', 'abyss', 'nord', 'sunset', 'caramellatte', 'silk'
];

const defaultPalette: DaisyPalette = {
  primary: '#4f46e5',
  'primary-content': '#ffffff',
  secondary: '#14b8a6',
  'secondary-content': '#ffffff',
  accent: '#f97316',
  'accent-content': '#ffffff',
  neutral: '#3d4451',
  'neutral-content': '#ffffff',
  'base-100': '#ffffff',
  'base-200': '#f1f2f5',
  'base-content': '#1f2937',
  info: '#0284c7',
  success: '#16a34a',
  warning: '#eab308',
  error: '#dc2626',
};

function isOklch(value: string): boolean {
  return typeof value === 'string' && value.trim().startsWith('oklch(');
}
function hexToOklch(hex: string): string {
  try {
    // Color.js does not support oklch, so use lch as a fallback
    return Color(hex).lch().string();
  } catch {
    return hex;
  }
}
function paletteToCssVars(palette: DaisyPalette): string {
  return Object.entries(palette)
    .map(([key, value]) => {
      if (isOklch(value)) {
        return `--color-${key.replace(/ /g, '')}:${value};`;
      } else {
        return `--color-${key.replace(/ /g, '')}:${hexToOklch(value)};`;
      }
    })
    .join('');
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => {
    const palette = JSON.parse(localStorage.getItem(LOCAL_KEY_PALETTE) || 'null') ?? defaultPalette;
    const name = (localStorage.getItem(LOCAL_KEY_NAME) || 'light').toLowerCase();
    const customPalettes = JSON.parse(localStorage.getItem(LOCAL_KEY_CUSTOM_PALETTES) || '{}');
    storeLog.debug('Initializing with theme', { name });
    return { name, palette, customPalettes };
  },
  getters: {
    themeName: (state) => state.name,
    isDarkMode: (state) => DARK_THEMES.includes(state.name),
  },
  actions: {
    applyTheme() {
      storeLog.debug('Applying theme', { name: this.name });
      // Remove any previous custom style blocks for custom themes (old and new IDs)
      THEME_NAMES_CUSTOM.forEach((customName) => {
        const styleIdOld = `daisy-custom-${customName}`;
        const styleId = `${customName}`;
        const styleElOld = document.getElementById(styleIdOld) as HTMLStyleElement | null;
        if (styleElOld) styleElOld.remove();
        const styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (styleEl) styleEl.remove();
      });
      // Inject or update a style tag for the current custom theme
      if (THEME_NAMES_CUSTOM.includes(this.name)) {
        const styleId = `${this.name}`;
        let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (styleEl) styleEl.remove();
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `html[data-theme="${this.name}"]{${paletteToCssVars(this.palette)}}`;
        document.head.appendChild(styleEl);
      }
      // Set data-theme attribute
      const prevTheme = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', this.name);
      storeLog.debug('Changed data-theme attribute', { prevTheme, newTheme: this.name });
      // Force a repaint to ensure theme changes are applied
      document.body.style.display = 'none';
      document.body.offsetHeight;
      document.body.style.display = '';
      // Persist
      localStorage.setItem(LOCAL_KEY_NAME, this.name);
      localStorage.setItem(LOCAL_KEY_PALETTE, JSON.stringify(this.palette));
      localStorage.setItem(LOCAL_KEY_CUSTOM_PALETTES, JSON.stringify(this.customPalettes));
      storeLog.debug('Theme applied successfully', { name: this.name });
      storeLog.debug('Current HTML data-theme', { value: document.documentElement.getAttribute('data-theme') });
      console.log('[themeStore][DEBUG] palette:', this.palette);
    },
    setPalette(newPalette: DaisyPalette) {
      console.log('[themeStore][DEBUG] setPalette: typeof newPalette:', typeof newPalette, 'isProxy:', !!(newPalette && (newPalette as any).__v_isReactive || (newPalette as any).__v_isReadonly), 'value:', newPalette);
      const plainPalette = JSON.parse(JSON.stringify(newPalette));
      console.log('[themeStore][DEBUG] setPalette: typeof plainPalette:', typeof plainPalette, 'isProxy:', !!(plainPalette && (plainPalette as any).__v_isReactive || (plainPalette as any).__v_isReadonly), 'value:', plainPalette);
      this.palette = { ...plainPalette };
      if (THEME_NAMES_CUSTOM.includes(this.name)) {
        this.customPalettes[this.name] = { ...plainPalette };
      }
      this.applyTheme();
      console.log('[themeStore][DEBUG] setPalette: name:', this.name, 'palette:', this.palette);
    },
    setTheme(name: string) {
      name = name.toLowerCase();
      console.log('[themeStore] Setting theme:', name);
      if (THEME_NAMES_CUSTOM.includes(name)) {
        this.name = name;
        // Use stored palette if available, else fallback to default
        this.palette = this.customPalettes[name] ? { ...this.customPalettes[name] } : { ...defaultPalette };
        this.applyTheme();
        console.log('[themeStore][DEBUG] setTheme (custom): name:', this.name, 'palette:', this.palette);
        return;
      }
      if (BUILT_IN_THEMES.includes(name)) {
        this.name = name;
        this.palette = { ...defaultPalette };
        this.applyTheme();
        console.log('[themeStore][DEBUG] setTheme (builtin): name:', this.name, 'palette:', this.palette);
      } else {
        console.warn(`[themeStore] Unknown theme: ${name}`);
      }
    },
    toggleDarkMode() {
      console.log('[themeStore] Toggling dark mode, current isDarkMode:', this.isDarkMode);
      if (this.isDarkMode) {
        this.setTheme('light');
      } else {
        this.setTheme('dark');
      }
    },
    setName(name: string) {
      name = name.toLowerCase();
      console.log('[themeStore] Setting theme name:', name);
      this.setTheme(name);
    },
    replaceCustomPalette(name: string, palette: DaisyPalette) {
      name = name.toLowerCase();
      console.log('[themeStore][DEBUG] replaceCustomPalette: typeof palette:', typeof palette, 'isProxy:', !!(palette && (palette as any).__v_isReactive || (palette as any).__v_isReadonly), 'value:', palette);
      // Remove from customPalettes
      if (this.customPalettes[name]) {
        delete this.customPalettes[name];
        console.log(`[themeStore][DEBUG] Removed palette for '${name}' from customPalettes.`);
      }
      // Remove style tag (old and new IDs)
      const styleIdOld = `daisy-custom-${name}`;
      const styleId = `${name}`;
      const styleElOld = document.getElementById(styleIdOld) as HTMLStyleElement | null;
      if (styleElOld) {
        styleElOld.remove();
        console.log(`[themeStore][DEBUG] Removed old style tag with id '${styleIdOld}'.`);
      }
      const styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      if (styleEl) {
        styleEl.remove();
        console.log(`[themeStore][DEBUG] Removed style tag with id '${styleId}'.`);
      }
      // Remove from localStorage
      const stored = JSON.parse(localStorage.getItem(LOCAL_KEY_CUSTOM_PALETTES) || '{}');
      if (stored[name]) {
        delete stored[name];
        localStorage.setItem(LOCAL_KEY_CUSTOM_PALETTES, JSON.stringify(stored));
        console.log(`[themeStore][DEBUG] Removed palette for '${name}' from localStorage.`);
      }
      // Add new palette as a plain object (not Proxy)
      const plainPalette = JSON.parse(JSON.stringify(palette));
      console.log('[themeStore][DEBUG] replaceCustomPalette: typeof plainPalette:', typeof plainPalette, 'isProxy:', !!(plainPalette && (plainPalette as any).__v_isReactive || (plainPalette as any).__v_isReadonly), 'value:', plainPalette);
      this.customPalettes[name] = plainPalette;
      localStorage.setItem(LOCAL_KEY_CUSTOM_PALETTES, JSON.stringify(this.customPalettes));
      console.log(`[themeStore][DEBUG] Added new palette for '${name}' to customPalettes:`, plainPalette);
      console.log(`[themeStore][DEBUG] customPalettes state:`, this.customPalettes);
      // Inject new style tag if active
      if (this.name === name) {
        this.palette = { ...plainPalette };
        this.applyTheme();
        console.log(`[themeStore][DEBUG] Applied new palette for active theme '${name}'.`);
      }
    },
    setCustomPalette(name: string, palette: DaisyPalette) {
      // Use replaceCustomPalette for full replacement
      this.replaceCustomPalette(name, palette);
    }
  },
});

export function initThemeStorePersistence() {
  const store = useThemeStore();
  console.log('[themeStore] Initializing theme persistence');
  store.applyTheme();
} 