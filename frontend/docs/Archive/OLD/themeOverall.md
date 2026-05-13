# Theme Switching and Customization Implementation Plan

Based on the research, here is a summary of what's needed to implement theme switching and customization.

## 1. Data and State Management (`themeStore.ts`)
- **Action:** Create a new Pinia store at `src/stores/themeStore.ts`.
- **Purpose:** To manage and persist the current theme name and custom primary color.
- **Details:**
    - State properties: `themeName` (string), `primaryColor` (string).
    - Persistence: Use `localStorage` to save user preferences across sessions.
    - Actions: `setTheme(themeName)`, `setPrimaryColor(color)`.

## 2. Main Application Logic (`main.ts`)
- **Action:** Modify `src/main.ts`.
- **Purpose:** To load the saved theme on application startup.
- **Details:**
    - On startup, read the `themeName` from the new `themeStore`.
    - Use a dynamic import to load the corresponding theme preset before initializing PrimeVue.
    - **Example:** `import(\`@primeuix/themes/${themeName.toLowerCase()}\`).then(theme => { app.use(PrimeVue, { theme: { preset: theme.default } }); });`

## 3. Theme Switching Component (`ThemeSelector.vue`)
- **Action:** Create a new component at `src/components/preferences/ThemeSelector.vue`.
- **Purpose:** To provide a UI for users to select a theme.
- **Details:**
    - Use a PrimeVue `Dropdown` component.
    - Options: `['Aura', 'Lara', 'Material', 'Nora']`.
    - `v-model` should be bound to the `themeName` property in the `themeStore`.
    - On change, it should call the `setTheme` action in the store.

## 4. Dynamic Theme Application (`useTheme.ts` composable)
- **Action:** Create a new composable at `src/composables/useTheme.ts`.
- **Purpose:** To apply theme changes dynamically without a page reload.
- **Details:**
    - Import `usePreset` from `primevue/config`.
    - Use a `watch` effect to monitor changes to `themeName` in the `themeStore`.
    - When `themeName` changes, dynamically import the new theme preset and call `usePreset()` with the imported theme object.

## 5. Color Customization Component (`ColorPicker.vue`)
- **Action:** Create a new component at `src/components/preferences/ColorPicker.vue`.
- **Purpose:** To allow users to pick a custom primary color.
- **Details:**
    - Use a PrimeVue `ColorPicker` component.
    - `v-model` should be bound to the `primaryColor` property in the `themeStore`.
    - On change, it should call the `setPrimaryColor` action.

## 6. Dynamic Color Application (`useTheme.ts` composable)
- **Action:** Add logic to the `useTheme.ts` composable.
- **Purpose:** To apply primary color changes dynamically.
- **Details:**
    - Import `updatePrimaryPalette` and `palette` from `@primeuix/themes`.
    - Use a `watch` effect to monitor changes to `primaryColor` in the `themeStore`.
    - When `primaryColor` changes, generate a new palette using `palette(newColor)` and apply it with `updatePrimaryPalette()`.

## 7. Integration into `PreferencesView.vue`
- **Action:** Modify `src/views/PreferencesView.vue`.
- **Purpose:** To integrate the new UI components.
- **Details:**
    - Import and add `ThemeSelector.vue` and `ColorPicker.vue`.
    - Place each component within its own `<div class="input-section">` for consistent styling. 