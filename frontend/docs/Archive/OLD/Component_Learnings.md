# Component Interaction Learnings

This document captures key learnings about complex component interactions within the Kanban frontend to prevent future bugs and assist with onboarding.

## `BaseDoubleClickInput` and `BaseInput` with VeeValidate

A significant and difficult-to-trace bug was discovered related to the interaction between `BaseDoubleClickInput`, `BaseInput`, and the `vee-validate` library.

### The Problem

The `BaseInput` component uses VeeValidate's `useField` composable to manage its state and validation. This composable internally tracks fields by a unique `name`. The `BaseDoubleClickInput` component wraps `BaseInput`.

The bug occurred when multiple `BaseDoubleClickInput` instances were used without providing a unique `valueKey` prop. This `valueKey` is passed down to the `BaseInput` as its `name`. When the names were not unique, VeeValidate would get confused and cross-wire the state between different inputs. This broke the `v-model` update chain, preventing changes from propagating correctly to the parent component. In the live application, this manifested as a misleading "computed value is readonly" warning, as Vue tried and failed to update a value that was not being correctly managed.

### The Solution & Guideline

1.  **Fix in `BaseInput.vue`**: A `watch` effect was added to the `onMounted` lifecycle hook in `BaseInput.vue`. This watcher observes the `useFieldValue` ref from VeeValidate and manually emits an `update:modelValue` event. This is the critical bridge that makes `v-model` work correctly on the `BaseInput` component.

2.  **Usage Guideline for `BaseDoubleClickInput.vue`**: **ALWAYS** provide a unique `valueKey` prop when using the `BaseDoubleClickInput` component. This ensures that the underlying `BaseInput` receives a unique `name` for VeeValidate, preventing any state management conflicts.

**Example:**

```vue
<!-- CORRECT USAGE -->
<BaseDoubleClickInput valueKey="project_name" v-model="projectName" />
<BaseDoubleClickInput valueKey="task_summary" v-model="taskSummary" />

<!-- INCORRECT USAGE (will cause bugs) -->
<BaseDoubleClickInput v-model="projectName" />
<BaseDoubleClickInput v-model="taskSummary" />
```

## PrimeVue `Dropdown` vs `Select` Migration

The deprecated PrimeVue `Dropdown` component was replaced with the `Select` component in `BaseSelect.vue`.

### Key API Differences

1.  **`optionDisabled` Prop**:
    *   **Dropdown (Old):** This prop accepted a `string` which was the key of a boolean property on the option object. Example: `optionDisabled="disabledOption"`.
    *   **Select (New):** This prop now requires a `function` that receives the option object and returns `true` if the option should be disabled. Example: `:option-disabled="(option) => option.disabledOption"`.

2.  **CSS Class Names**:
    *   The scoped CSS selectors had to be updated from `p-dropdown-*` to `p-select-*` (e.g., `.p-dropdown-trigger` became `.p-select-trigger`).

These were the only changes required for a successful migration.

### PrimeVue Component Migrations

- **Dropdown -> Select**: The deprecated `Dropdown` component has been fully replaced by the `Select` component. The wrapper `BaseSelect.vue` now uses `<Select>` and has been updated to use the corresponding props (`items`, `optionsLabel`, `optionsValue`). Any tasks related to this deprecation are now obsolete. 