# GEMINI.md - Kanban-frontend (Kanbanana)

This file provides foundational mandates, technical overview, and development standards for the Kanban-frontend project.

## Project Overview

**Kanbanana** is a modern, responsive Kanban board application built with a high-performance Vue 3 stack. It focuses on intuitive task management using drag-and-drop interactions and a themeable, Material 3 (M3) inspired design.

- **Frontend Framework:** Vue 3 (Composition API, `<script setup>`)
- **Language:** TypeScript
- **Build Tool:** Vite
- **State Management:** Pinia
- **Styling:** Tailwind CSS 4, DaisyUI 5, SCSS (Dart Sass)
- **Data Fetching:** TanStack Vue Query, Axios
- **Routing:** Vue Router
- **Testing:** Vitest (Unit & Browser)
- **Validation:** Vee-Validate
- **Key Libraries:** `dragon-drop-vue`, `vue-draggable-plus`, `data-grid-vue`

## Building and Running

Ensure you have Node.js installed. Use `npm` for package management.

| Task | Command | Description |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | Start development server at `http://localhost:4000`. |
| **Build** | `npm run build` | Perform type checking (`vue-tsc`) and build for production. |
| **Preview** | `npm run preview` | Serve the locally built production files. |
| **Unit Test** | `npm run test:unit` | Run Vitest unit tests once. |
| **Browser Test**| `npm run test:browser` | Run Vitest browser tests. |
| **Lint Style** | `npm run lint:style` | Lint SCSS/CSS/Vue files using Stylelint. |
| **Fix Style** | `npm run lint:style:fix` | Automatically fix Stylelint issues. |

### Environment Variables

Copy `.env.example` to `.env` and configure the following:
- `VITE_API_BASE_URL`: Base URL for the backend API (default: `http://localhost:3000`).
- `VITE_WS_BASE_URL`: Base URL for WebSockets (default: `ws://localhost:8080`).

## Development Conventions

### Path Aliases
Always use the `@` alias for imports from the `src` directory to maintain stability.
- `@/*` -> `src/*`
- `@styles/*` -> `src/styles/*`
- `@components/*` -> `src/components/*`
- `@assets/*` -> `src/assets/*`

### Styling Standards
Adhere strictly to `docs/STYLING_GUIDELINES.md` and `CODING_STANDARDS.md`.

1.  **Frameworks First:** Prefer DaisyUI semantic classes (e.g., `card`, `btn`, `bg-primary`) and Tailwind utilities over custom CSS.
2.  **Semantic Colors:** Use `primary`, `secondary`, `accent`, and `base-*` colors. Avoid hardcoded Tailwind hex colors (e.g., `bg-red-500`) unless necessary.
3.  **SCSS Usage:**
    - Place global/shared SCSS in `src/styles/`.
    - Use `@use` instead of the deprecated `@import`.
    - Prefix partials with an underscore (e.g., `_variables.scss`).
4.  **Theming:** Use DaisyUI's theme system. Do not use `dark:` variants; the `themeStore` manages theme switching via the `data-theme` attribute on `<html>`.

### Architecture & State
- **Stores:** Use Pinia stores (found in `src/stores/`) for global state (Auth, Theme, Layout, Boards).
- **Components:** Organize UI components into logical folders (e.g., `src/components/layout/`, `src/components/base/`).
- **Base Components:** Common UI elements (buttons, inputs) are registered globally in `src/main.ts` with a `Base` prefix (e.g., `<BaseButton />`).
- **Data Flow:** Use TanStack Vue Query for server state management to ensure caching and synchronization.

### Technical Integrity
- **Type Safety:** Always use TypeScript. Avoid `any` and define proper interfaces in `src/types/`.
- **Validation:** Use `vee-validate` for form handling and validation.
- **Testing:** New features or bug fixes should include corresponding Vitest cases.
