# Theming Guide for Kanban Frontend

This document provides a comprehensive guide to understanding and utilizing the theming capabilities within the Kanban Frontend project. The project leverages **Tailwind CSS** and a **Pinia store** for state management, all built around **Material Design 3 (M3)** color tokens.

## 1. Core Theming Concepts

Understanding these fundamental concepts is key to effective theming in this project:

### 1.1. Material Design 3 (M3) Color Tokens

The project's theming is structured around Material Design 3's semantic color roles. Instead of directly assigning colors like `blue-500`, you assign colors to roles that describe their purpose. This allows for flexible and consistent theming across light and dark modes.

Key M3 tokens include:
-   `primary`, `secondary`, `tertiary`: Main brand colors and their variations.
-   `on-primary`, `on-secondary`, `on-tertiary`: Colors for text and icons that appear *on top of* the corresponding primary, secondary, or tertiary colors, ensuring readability.
-   `primary-container`, `secondary-container`, `tertiary-container`: Container colors for elements that group related content.
-   `on-primary-container`, etc.: Text/icon colors for the container colors.
-   `background`, `on-background`: Main background color and text/icon color on it.
-   `surface`, `on-surface`, `surface-variant`, `on-surface-variant`: Colors for UI elements like cards, sheets, and dialogs, and their respective text/icon colors.
-   `error`, `on-error`, `error-container`, `on-error-container`: Colors for error states.
-   `outline`, `outline-variant`: Colors for borders and outlines.

Additionally, custom tokens like `success`, `warning`, and `overlayBackground` are used for specific application needs.

### 1.2. Light and Dark Modes

The theming system fully supports distinct light and dark modes. Each M3 token has a corresponding color value for both modes, ensuring a visually harmonious experience regardless of the user's preference.

### 1.3. `themeStore.ts` (Pinia State Management)

The `src/stores/themeStore.ts` Pinia store is the central source of truth for the application's theme state. It holds the `currentTheme` object, which contains the color values for both light and dark modes. When a theme is applied, the store updates CSS variables on the `document.documentElement` (the `<html>` tag), making the colors globally available.

### 1.4. CSS Variables and Tailwind CSS

Colors defined in the `themeStore` are exposed as CSS variables (e.g., `--color-primary`, `--color-surface`) on the root HTML element. To make these variables usable with Tailwind's utility classes, the `tailwind.config.js` file is configured to map these CSS variables to Tailwind color names.

**Example `tailwind.config.js`:**

```javascript
theme: {
  extend: {
    colors: {
      primary: 'var(--color-primary)',
      surface: 'var(--color-surface)',
      // ... other theme colors
    },
  },
},
```

This configuration allows you to use semantic utility classes like `bg-surface` and `text-primary` directly in your components. The `themeStore` can still dynamically update the CSS variables, and Tailwind will automatically apply the new colors.

**Correct Usage:**

```html
<div class="bg-surface text-primary">
  This is a correctly themed element.
</div>
```

**Incorrect Usage:**

Do NOT use the M3 token names directly as Tailwind classes without the proper configuration. The following will NOT work:

```html
<!-- Incorrect: This will fail if 'surface' is not defined in tailwind.config.js -->
<div class="bg-surface">
  This will not be themed correctly.
</div>
```

## 2. Theming with the Theme Playground (`src/views/ThemePlayground.vue`)

The `ThemePlayground.vue` component provides an interactive interface to customize and preview themes without writing code.

### 2.1. Palette Selection

-   **Location:** The left column of the Theme Playground, powered by `ThemeSelector.vue`.
-   **Functionality:** You can select a base Tailwind CSS color palette (e.g., "Indigo", "Red", "Zinc"). When selected, the Theme Playground automatically populates the M3 color roles for both light and dark modes based on Material Design 3 guidelines (e.g., `primary` might map to `indigo-500`, `surface` to `indigo-100` in light mode).

### 2.2. Color Role Editing

-   **Location:** The central grid of the Theme Playground, using `ColorRoleEditor.vue`.
-   **Functionality:** For each M3 token, you can individually adjust its color for both light and dark modes. Clicking on a color swatch will open a color picker, allowing you to select any hex color. Changes are reflected in real-time in the Live Preview (if implemented).

### 2.3. Transparency Adjustment

-   **Location:** Within the "Theme Actions" section.
-   **Functionality:** You can toggle and adjust the transparency of the `overlayBackground` color. This is particularly useful for modals and dialogs to control the opacity of the background overlay.

### 2.4. Applying Themes

-   **Location:** Within the "Theme Actions" section.
-   **Functionality:** After customizing your theme, select whether to apply the "Light", "Dark", or "Random" theme configuration. Clicking "Apply Theme" will save your current selections to the `themeStore` and update the application's live theme by setting the corresponding CSS variables.

### 2.5. Random Theme Generation

-   **Location:** Within the "Theme Actions" section, via the "Spin" button.
-   **Functionality:** The "Spin" button generates a completely random theme. It starts by picking a random base RGB color. Then, for each M3 color token, it derives a new color by applying a slight hue rotation and lightness adjustment to the base color. This provides a quick way to explore diverse color combinations.

### 2.6. Pre-built Themes

-   **Location:** Below the palette selection, using `ThemeDrawers.vue`.
-   **Functionality:** You can select from a set of pre-defined, curated themes (e.g., "Dracula", "Solarized", "Nord"). Selecting a pre-built theme instantly populates the Theme Editor with its specific color values, providing a quick starting point for customization.

## 3. Advanced Theming (Code-Level)

For more granular control or to define application-wide theme defaults, you'll interact with the code directly.

### 3.1. Dynamic Color Manipulation (`color` library)

The project uses the `color` npm package (imported as `Color` in `ThemePlayground.vue`) for advanced color manipulation. This library is crucial for:

-   **Calculating "on" colors:** Ensuring text and icons have sufficient contrast against their background colors (e.g., automatically determining if white or black text should be used on a given background).
-   **Color transformations:** Lightening, darkening, rotating hue, or adjusting alpha values of colors programmatically.

If you need to implement custom color logic or derive new colors based on existing ones, this library is your primary tool.

### 3.3. Tailwind CSS Integration

Tailwind CSS is used extensively throughout the project for utility-first styling. You can apply Tailwind classes directly to HTML elements. The `tailwind.config.js` file defines the project's Tailwind configuration, including custom colors or extensions.

## 4. Best Practices for Theming

-   **Prioritize M3 Tokens:** Whenever possible, use the defined M3 color tokens (via CSS variables like `var(--color-primary)`) rather than hardcoding hex values or direct Tailwind color classes. This ensures your components respect the active theme.

-   **Maintain Consistency:** Strive for visual consistency across the application. Use the Theme Playground to preview changes and ensure they look good in both light and dark modes.
-   **Accessibility:** Always consider contrast ratios for text and interactive elements to ensure readability for all users. The `color` library can assist with this.
-   **Test Thoroughly:** After making any theme-related changes, test the application in both light and dark modes to catch any visual regressions or unexpected behaviors.
-   **Leverage `themeStore`:** If you need to programmatically change or retrieve theme colors, interact with the `useThemeStore()` Pinia store.

By following this guide, you can effectively utilize and extend the theming capabilities of the Kanban Frontend project to create a visually appealing and customizable user experience.