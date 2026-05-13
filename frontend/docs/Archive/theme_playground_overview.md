# Theme Playground, Theme Store, and Theme Switcher Overview

## 1. Theme Playground (UI)

The **Theme Playground** is an interactive interface for previewing, customizing, and managing color themes in the Kanban frontend. It allows users to:

- Browse and preview built-in DaisyUI and Tailwind color palettes.
- Edit and experiment with color roles (primary, secondary, accent, etc.) for Light, Dark, and Random columns.
- Add custom palettes to the theme collection for use as custom themes.
- Instantly apply a theme to the UI for live preview.

### Main Features
| Column         | Description                                                      |
|---------------|------------------------------------------------------------------|
| Light         | Edit and preview a light-mode palette.                           |
| Dark          | Edit and preview a dark-mode palette.                            |
| Random        | Generate and preview a random palette for experimentation.        |

- **Add to Theme Collection**: Saves the current palette as a custom theme (see below).
- **Theme Switcher**: Lets users switch between built-in and custom themes.

---

## 2. Pinia Theme Store (`src/stores/themeStore.ts`)

The **theme store** manages theme state, palette data, and theme switching logic. It is implemented as a Pinia store and provides the following:

### State
- `name`: Current theme name (e.g., `light`, `dark`, `customlight`, `customdark`, `random`, or any DaisyUI theme).
- `palette`: The active palette (object mapping color roles to hex values).
- `customPalettes`: Record of custom theme names to palettes (session only).

### Key Actions
- `setTheme(name)`: Switches the active theme. Loads the palette for custom themes, or defaults for built-in themes.
- `setPalette(palette)`: Updates the current palette and applies it.
- `replaceCustomPalette(name, palette)`: Replaces a custom palette and updates the store/localStorage.
- `applyTheme()`: Injects a `<style>` tag with CSS variables for the active theme and sets the `data-theme` attribute on `<html>`.

#### Example: Switching to a Custom Theme
```js
// Switch to customdark (palette must be in customPalettes)
themeStore.setTheme('customdark');
```

#### Example: Adding a Custom Palette
```js
// Save a new palette for customdark
themeStore.replaceCustomPalette('customdark', myPaletteObject);
```

### Notes on Persistence
- **Custom themes (`customlight`, `customdark`, `random`) are NOT persisted long-term.**
  - They are stored in the Pinia store and localStorage for the current session only.
  - On reload, only the last active theme and palette are restored.
- **Future iterations may add persistent custom themes and toggling available themes.**

---

## 3. Theme Switcher (UI & Logic)

The **Theme Switcher** is a UI component that allows users to:
- Select from all available built-in DaisyUI themes.
- Instantly switch to custom themes (`customlight`, `customdark`, `random`) if they exist in the store.
- See which theme is currently active.

### How It Works
- When a theme is selected, the switcher calls `themeStore.setTheme(themeName)`.
- The store updates the `data-theme` attribute and injects a style tag for custom themes.
- The UI updates immediately to reflect the new palette.

#### Example: Switching Themes
```js
// In the Theme Switcher component
onThemeSelect(themeName) {
  themeStore.setTheme(themeName);
}
```

---

## 4. Current Limitations & Future Directions

- **Custom themes are not persisted long-term.**
  - If you want to keep a custom theme, you must re-add it each session.
- **Theme toggling and management** (e.g., hiding/showing available themes, renaming, or deleting custom themes) is not yet implemented.
- **Palette editing** is session-based and not shared between users or across devices.

---

## 5. Quick Reference Table

| Theme Type   | Persistence      | How to Add/Update         | How to Apply         |
|--------------|------------------|---------------------------|----------------------|
| Built-in     | Permanent (code) | N/A                       | Theme Switcher       |
| customlight  | Session only     | Add to Theme Collection   | Theme Switcher       |
| customdark   | Session only     | Add to Theme Collection   | Theme Switcher       |
| random       | Session only     | Add to Theme Collection   | Theme Switcher       |

---

## 6. Developer Notes
- All theme switching and palette logic is centralized in the Pinia theme store.
- Custom themes must use the exact names `customlight`, `customdark`, or `random` to be recognized by the switcher.
- The store ensures all palettes are stored as plain objects (not Vue Proxies) for serialization and CSS injection.
- The injected style tag always comes last in `<head>` to ensure custom variables override any built-in styles.

---

## 7. Theme Playground Store (`playgroundStore`)

The **playgroundStore** is a Pinia store that manages transient state for the Theme Playground UI. It is responsible for:

- Holding the current working palettes for the Light, Dark, and Random columns.
- Providing palette editing and randomization logic before palettes are committed to the main theme store.
- Enabling users to experiment with color roles without immediately affecting the global theme.

### State
- `lightPalette`: The working palette for the Light column.
- `darkPalette`: The working palette for the Dark column.
- `randomPalette`: The working palette for the Random column (can be regenerated or edited).

### Key Actions
- `updatePalette(mode, role, newHex)`: Update a specific color role in a palette (e.g., change primary color in Light palette).
- `generateRandomPalette()`: Create a new random palette for experimentation.
- `resetPalette(mode)`: Reset a palette to its default values.

### How It Interacts with the Theme Store
- When a user clicks **Add to Theme Collection** for a column, the current palette from `playgroundStore` is passed to `themeStore.setCustomPalette()` (or `replaceCustomPalette()`), making it available as a custom theme.
- The playgroundStore state is **session-only** and is reset on page reload unless explicitly saved to the theme store.

#### Example: Adding a Palette from Playground
```js
// Add the current dark palette to the customdark theme
const { darkPalette } = playgroundStore;
themeStore.setCustomPalette('customdark', { ...darkPalette });
```

---

For further details, see the code in `src/stores/themeStore.ts` and the Theme Playground UI components. 