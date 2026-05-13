# Kanban-Frontend Overview
## Introduction
The Kanban-Frontend project is a Vue.js application that provides a kanban board interface for managing projects and tasks. The project uses a range of dependencies and dev dependencies to provide a robust and feature-rich development environment.

## Project Structure
The project is structured into several directories, including:
* `src`: The source code directory, which contains the application's components, stores, and utilities.
* `types`: The type definitions directory, which contains the application's type definitions.
* `utils`: The utilities directory, which contains the application's utility functions.
* `composables`: The composables directory, which contains the application's composables.

## Dependencies
The project uses a range of dependencies, including:
### Core Dependencies
* `@primevue/themes`: A theme library for PrimeVue.
* `axios`: A library for making HTTP requests.
* `lodash.clonedeep`: A library for deep cloning objects.
* `lodash.debounce`: A library for debouncing functions.
* `pinia`: A state management library for Vue.
* `primeflex`: A flexbox library for PrimeVue.
* `primeicons`: An icon library for PrimeVue.
* `primevue`: A UI component library for Vue.
* `quill`: A rich text editor library.
* `vee-validate`: A validation library for Vue.
* `vue`: The Vue.js framework.
* `vue-router`: A routing library for Vue.
* `vuedraggable`: A draggable library for Vue.
* `ws`: A WebSocket library.

## Dev Dependencies
The project uses a range of dev dependencies, including:
### Development Tools
* `@ianvs/prettier-plugin-sort-imports`: A Prettier plugin for sorting imports.
* `@types/axios`: Type definitions for Axios.
* `@types/lodash.clonedeep`: Type definitions for Lodash.clonedeep.
* `@types/lodash.debounce`: Type definitions for Lodash.debounce.
* `@types/node`: Type definitions for Node.js.
* `@types/ws`: Type definitions for WS.
* `@vitejs/plugin-vue`: A Vite plugin for Vue.
* `@vitest/browser`: A Vitest plugin for browser testing.
* `@vue/compiler-sfc`: A Vue compiler for single-file components.

### Testing and Linting
* `axe-core`: A library for accessibility testing.
* `oxlint`: A linter for Vue.
* `playwright`: A browser automation library.
* `postcss`: A CSS post-processor.
* `prettier`: A code formatter.
* `sass`: A CSS pre-processor.
* `stylelint`: A CSS linter.
* `stylelint-config-recommended-vue`: A Stylelint configuration for Vue.
* `stylelint-config-standard`: A Stylelint configuration for standard CSS.
* `stylelint-config-standard-scss`: A Stylelint configuration for SCSS.

### Build and Deployment
* `typescript`: The TypeScript compiler.
* `vite`: The Vite development server.
* `vitest`: A testing library for Vue.
* `vue-axe`: A library for accessibility testing in Vue.
* `vue-i18n`: A library for internationalization in Vue.
* `vue-router-mock`: A library for mocking Vue Router.
* `vue-tsc`: A TypeScript compiler for Vue.

## Store
The project uses a Pinia store for state management. The store is divided into several modules, including:
* `auth`: The authentication module, which handles user authentication and authorization.
* `projects`: The projects module, which handles project data and management.
* `tasks`: The tasks module, which handles task data and management.

## Components
The project uses a range of components, including:
* `Sidebar`: A sidebar component that provides navigation and menu options.
* `Topbar`: A topbar component that provides navigation and menu options.
* `Board`: A board component that displays a kanban board.
* `TaskTile`: A task tile component that displays a single task.
* `ProjectSettings`: A project settings component that provides project settings and management options.

## Utilities
The project uses a range of utility functions, including:
* `trimText`: A function for trimming text to a specified length.
* `formatDate`: A function for formatting dates.
* `getImageUrl`: A function for getting an image URL.
* `isObject`: A function for checking if a value is an object.
* `stringDeepCopy`: A function for deep copying a string.

## Scripts
The project uses a range of scripts, including:
* `dev`: A script for running the development server.
* `build`: A script for building the project for production.
* `preview`: A script for previewing the built project.
* `lint:style`: A script for linting the project's CSS and SCSS files.
* `lint:style:fix`: A script for linting and fixing the project's CSS and SCSS files.
* `test:browser`: A script for running the project's browser tests.
* `test:unit`: A script for running the project's unit tests.
