# Theme Playground: Product Requirements Document

## 1. Overview

This document outlines the functional and design requirements for the **Theme Playground**, an interactive interface that allows users to create, customize, and save visual themes for the Kanban application. The goal is to provide a flexible and intuitive way for users to personalize their experience, ensuring that all UI elements are themable and accessible.

## 2. Core Components & UI

The Theme Playground will consist of three main components: the **Theme Selector**, the **Theme Editor**, and the **Live Preview**.


### 2.1. Theme Selector: Palette Drawer

A scrolling drawer component (e.g., Flowbite Drawer) will contain the full range of default Tailwind CSS color palettes (Slate, Gray, Zinc, Red, Indigo, etc.).

-   **Functionality:**
    -   When a user selects a base palette (e.g., "Indigo"), the **Theme Editor** card will be automatically populated with shades from that palette according to Material Design 3 guidelines (e.g., `primary` maps to `indigo-500`, `secondary` to `indigo-600`, etc.).
    -   Each color in the drawer should display all its shades, from 50 to 950, to allow for fine-grained selection if desired.

### 2.2. Theme Selector: Pre-built Themes

A carousel or grid will display a selection of pre-built, curated themes (e.g., "Vibe Dark," "Ocean Blue," "Forest").

-   **Functionality:**
    -   Selecting a pre-built theme will instantly populate the **Theme Editor** with that theme's specific color values for both light and dark modes.
    -   Users can then use the pre-built theme as a starting point for further customization.

### 2.3. Theme Editor Card

This is the central hub for customization, as shown in the reference image.

-   **Components:**
    -   **Light/Dark Mode Toggle:** Buttons to switch the editor between "Edit Light" and "Edit Dark" modes.
    -   **Semantic Role List:** A list of all themable UI color roles:
        -   Primary
        -   Secondary
        -   Background
        -   Surface
        -   Text
        -   Text Secondary
        -   Border
        -   Error
        -   Success
        -   Warning
        -   **Overlay Background**: For modals and dialogs.
    -   **Color Swatch/Picker:** Each role will have a color swatch. Clicking it will open a full color picker/palette, allowing the user to select any color, not just the ones from the initial palette.
    -   **Translucency Slider:** The "Overlay Background" role will include a slider to control its opacity (e.g., from 0% to 100%).
    -   **Apply Button:** Saves the current light and dark theme configuration to the user's profile and applies it to the application.

### 2.4. Live Preview

A dedicated section of the screen will render a sample, non-interactive Kanban board.

-   **Functionality:** This preview will update in real-time as the user makes changes in the Theme Editor, showing how the selected colors will affect different UI components (buttons, cards, backgrounds, text, etc.).

## 3. Core Logic (Functional Requirements)

### 3.1. Palette-to-Role Mapping

-   A utility function will be created to map a selected Tailwind palette to the semantic color roles.
-   This mapping will follow Material Design 3 principles for contrast and visual hierarchy. For example:
    -   **Light Mode:** `primary` = `[color]-600`, `secondary` = `[color]-500`, `background` = `[color]-50`, `surface` = `[color]-100`.
    -   **Dark Mode:** `primary` = `[color]-400`, `secondary` = `[color]-300`, `background` = `slate-900`, `surface` = `slate-800`.

### 3.2. Contrast-Aware "On" Colors

-   For each semantic color with a background (Primary, Secondary, Surface, Background, Error, etc.), an "on-" color for text and icons must be calculated automatically.
-   This will be based on the WCAG contrast ratio. A utility will check the luminance of the background color and return either a light color (e.g., `#FFFFFF`) or a dark color (e.g., `#1E1E1E`) to ensure readability.

### 3.3. Light/Dark Mode Inversion

-   The light and dark themes must be logical inverses. When a user customizes the light theme, the system should suggest a reasonable dark theme counterpart, and vice-versa.
-   The mapping logic in 3.1 will handle the initial inversion. If the user customizes a color, the system will not override their choice for the other mode unless they explicitly request it.

## 4. Pre-built Theme Inspirations

The theme carousel should include a variety of popular and aesthetically pleasing options. Here are some suggestions inspired by well-known developer themes:

| Theme Name | Description | Base Tailwind Palette(s) |
| :--- | :--- | :--- |
| **Dracula** | A classic, popular dark theme with vibrant purple and pink accents. | `purple`, `pink`, `slate` |
| **Solarized** | A low-contrast theme designed for comfort, with both light and dark variants. | `blue`, `yellow`, `cyan`, `slate` |
| **Nord** | An arctic, north-bluish color palette that is clean and elegant. | `slate`, `blue`, `sky` |
| **Gruvbox** | A retro, warm theme with muted colors for a cozy feel. | `amber`, `orange`, `stone` |
| **Monokai** | A high-contrast, vibrant theme known for its use in Sublime Text. | `lime`, `pink`, `cyan`, `neutral` |
| **Vibe** | The default Kanban theme, a professional and modern look. | `indigo`, `slate` |

## 5. Implementation Strategy

This section outlines a technical approach for building the Theme Playground, leveraging the existing project stack.

### 5.1. Component Structure

The feature will be built within the existing Vue 3 and Vite setup.

1.  **Main View:** Create a new view component, `src/views/PreferencesView.vue`, which will house the entire Theme Playground.
2.  **Child Components:** Break the UI into smaller, manageable components:
    *   `src/components/preferences/ThemeSelector.vue`: Contains the logic for the **Palette Drawer** and the **Pre-built Themes Carousel**.
    *   `src/components/preferences/ThemeEditor.vue`: The main card for editing light/dark mode colors, as seen in the `ThemeGenExample.png`. It will manage the state for the two columns.
    *   `src/components/preferences/ColorRoleEditor.vue`: A reusable component for a single row in the editor (e.g., "Primary" label + color swatch + hex value).
    *   `src/components/preferences/KanbanPreview.vue`: A static, non-interactive component that renders a sample board. Its styles will be driven by CSS variables updated from the theme store.

### 5.2. State Management (Pinia)

The existing `src/stores/themeStore.ts` will be the single source of truth for all theme-related data.

-   **State:**
    -   `currentTheme`: An object containing separate `light` and `dark` objects.
    -   Each mode object will hold key-value pairs for all semantic roles (e.g., `primary: '#3f51b5'`, `surface: '#9fa8da'`).
    -   It will also store the calculated "on-" colors (e.g., `onPrimary: '#ffffff'`).
-   **Actions:**
    -   `setThemeFromPalette(paletteName)`: Takes a Tailwind color name (e.g., "indigo") and populates the `currentTheme` state based on the mapping rules.
    -   `setThemeFromPreset(presetName)`: Loads a pre-built theme's configuration into the state.
    -   `updateColor(mode, role, newColor)`: Updates a single color role and recalculates the corresponding "on-" color.
    -   `applyTheme()`: Persists the `currentTheme` to local storage and updates the CSS variables on the root document element.

### 5.3. Key Dependencies & Logic

1.  **Install Color Utility:** Since no color utility is present in `package.json`, the first step is to add one.
    -   **Action:** Run `npm install color`.
    -   **Usage:** This library will be used inside the `themeStore` to implement a `calculateOnColor(hexColor)` action that determines if white or black text should be used for contrast.

2.  **UI Components:**
    -   **Drawer/Carousel:** While the project is moving away from PrimeVue, we can leverage its components for speed, but styled with Tailwind to match the new direction. Use PrimeVue's `Sidebar` (as a drawer) for the palette selection and `Carousel` for pre-built themes. Apply Tailwind classes via the `pt` (pass-through) property.
    -   **Layout:** Use Tailwind CSS for all layout, flexbox, and grid arrangements.
    -   **Color Picker:** PrimeVue's `ColorPicker` can be used when a user clicks a color swatch for fine-grained control.

### 5.4. Development Steps

1.  **Setup:** Install the `color` library. Create the placeholder `.vue` files for the components listed in 5.1.
2.  **Store:** Enhance `themeStore.ts` with the new state structure and actions.
3.  **Palette Drawer:** Implement the `ThemeSelector.vue` to display Tailwind palettes. Wire it to the `setThemeFromPalette` action.
4.  **Theme Editor:** Build the `ThemeEditor.vue` and `ColorRoleEditor.vue` components. They should read data from the `themeStore` and call the `updateColor` action on change.
5.  **Contrast Logic:** Implement the `calculateOnColor` function in the store using the `color` library.
6.  **Live Preview:** Build the `KanbanPreview.vue` component. Its styles should be bound to CSS variables that are updated by the `themeStore`.
7.  **Persistence:** Implement the `applyTheme` action to save to local storage and dynamically update the application's live theme.

## 4. User Flow

1.  The user navigates to **Settings > Preferences > Theme**.
2.  The user is presented with the Theme Playground.
3.  **Path A (Palette):** The user opens the **Palette Drawer**, scrolls to the "Indigo" palette, and clicks it. The Theme Editor populates with shades of Indigo for both light and dark modes. The Live Preview updates instantly.
4.  **Path B (Pre-built):** The user selects the "Ocean Blue" pre-built theme from the carousel. The Theme Editor and Live Preview update instantly.
5.  The user decides to change the "Error" color in dark mode. They click the color swatch next to "Error" under the "Dark" column.
6.  A full color picker appears, and they select a new color. The Live Preview updates.
7.  The user clicks "Apply." The theme is saved, and the entire application UI updates to the new theme.
