# Coding Standards & Best Practices

This document outlines the coding standards for the Kanban-frontend project to ensure consistency, maintainability, and stability. All future development should adhere to these guidelines.

## 1. Directory Structure for Styles

All global and shared SCSS files **must** reside in the `src/styles` directory. This centralized location helps prevent style duplication and makes assets easier to find.

```
src/
└── styles/
    ├── _variables.scss      # Project-wide CSS variables (colors, fonts, etc.).
    ├── _mixins.scss         # Reusable SCSS mixins.
    ├── _functions.scss      # Reusable SCSS functions (e.g., get-color).
    └── main.scss            # Global, non-scoped CSS rules (e.g., resets, body styles).
```

- **Partials (`_` prefix):** Files intended to be imported into other files (`_variables.scss`, `_mixins.scss`, `_functions.scss`) must start with an underscore. This prevents the Sass compiler from outputting them as standalone CSS files.
- **Global Rules (`main.scss`):** This file is for CSS rules that apply to the entire application. It should be imported **only once** in `src/main.ts`.

## 2. Pathing: Always Use the `@` Alias

To avoid fragility and improve readability, all imports within the `src` directory **must** use the `@` alias.

- **The Problem with Relative Paths (`../`):**
  Relative paths are brittle. If you move a component to a different directory, all its relative imports break. They also make it difficult to understand a file's location just by looking at the import path.

  ```scss
  // ❌ BAD: Fragile and hard to read
  @import '../../../composables/useMyComposable.ts';
  ```

- **The Solution with `@` Alias:**
  The `@` alias is configured in `vite.config.ts` to point directly to the `/src` directory. This creates a stable, absolute-style path from the root of your source code.

  ```typescript
  // ✅ GOOD: Stable, clear, and easy to maintain
  import useMyComposable from '@/composables/useMyComposable.ts';
  ```

  This standard applies to **all** imports: components, composables, types, stores, and SCSS files.

## 3. SCSS: Use `@use`, Not `@import`

The `@import` rule is deprecated and **must not** be used. We use the modern `@use` rule, which provides better encapsulation through namespacing.

### Common `@use` Patterns

1.  **Importing Functions and Variables:**
    When you need access to shared functions or variables within a component's `<style>` block, use `@use` with a namespace.

    ```scss
    // ✅ GOOD: Using a namespace (`colors`) to access the `get-color` function.
    @use '@/styles/functions/_colors.scss' as colors;

    .my-component {
      // Now you can use the function with its namespace
      color: colors.get-color('primary', 'base');
    }
    ```

2.  **Importing Mixins:**
    The pattern is the same for mixins.

    ```scss
    // ✅ GOOD: Using a namespace (`mixins`) to include a mixin.
    @use '@/styles/_mixins.scss' as mixins;

    .my-element {
      @include mixins.flex-center;
    }
    ```

By following these standards, we ensure the codebase remains robust, readable, and easy to maintain as it evolves. 