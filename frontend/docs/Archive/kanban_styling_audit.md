# Kanban Styling Audit

## Board.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| card, card-body                          | DaisyUI   | Task card and content                           | Yes                 | Standard DaisyUI card usage                                                             |
| bg-base-100, text-base-content/80,/60    | DaisyUI   | Card background, text color                     | Yes                 | Uses DaisyUI semantic colors                                                            |
| shadow-lg                                | DaisyUI   | Card elevation                                  | Yes                 | DaisyUI shadow utility                                                                 |
| w-full, min-h-screen, flex, flex-row...  | Tailwind  | Layout, sizing, spacing                         | Yes (layout utils)   | Standard Tailwind, allowed per DaisyUI rules                                            |
| bg-gradient-to-br, from-primary, to-secondary, to-80% | Tailwind | Board background gradient                       | Partial              | DaisyUI colors, but gradient is Tailwind; DaisyUI does not have a gradient component    |
| min-w-[220px], max-w-[220px], w-[220px], h-[138px] | Tailwind | Card sizing                                     | No                  | Custom sizing, not DaisyUI-specific                                                     |
| projects-wrapper, kanban-task-list, kanban-drop-placeholder | Custom    | Wrappers, DnD list, empty state                 | No                  | Not DaisyUI; could be replaced with DaisyUI or documented as custom                     |
| <pre> style="..."                        | Inline    | Error output                                    | No                  | Not DaisyUI; could use DaisyUI alert/code block                                         |
| loading, loading-spinner, loading-lg     | DaisyUI   | Loading indicator                               | Yes                 | DaisyUI loading component                                                              |
| text-red-500                             | Tailwind  | Error text                                      | No                  | Should use DaisyUI error color (text-error) for theme support                           |
| TODO: Persist move to backend            | Comment   | DnD persistence                                 | N/A                 | Implementation note, not styling                                                        |

## TaskTile.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| flex, flex-col, focus:outline, ...       | Tailwind  | Layout, focus, spacing                          | Yes (layout utils)   | Standard Tailwind, allowed per DaisyUI rules                                            |
| focus:outline-primary                    | Tailwind  | Focus ring color                                | Yes                 | Uses DaisyUI semantic color                                                             |
| tooltip                                  | Tailwind  | Description tooltip                             | Partial              | DaisyUI has tooltip component, but not used here (TODO present)                         |
| w-8, h-8, rounded-full, object-cover     | Tailwind  | Avatar sizing/shape                             | Yes                 | Standard Tailwind, matches DaisyUI avatar pattern                                       |
| task__tile, task__title, ... (BEM style) | Custom    | Tile, title, description, identifier, assignee  | No                  | Not DaisyUI; could be replaced with DaisyUI or documented as custom                     |
| TODO: Replace with DaisyUI Tooltip       | Comment   | Tooltip for identifier/assignee                 | N/A                 | Should migrate to DaisyUI tooltip                                                       |

## DialogTemplate.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| modal-box, modal-action                  | DaisyUI   | Modal container, actions                        | Yes                 | Standard DaisyUI modal usage                                                            |
| w-full, max-w-2xl, mb-4                  | Tailwind  | Sizing, spacing                                 | Yes                 | Standard Tailwind, allowed per DaisyUI rules                                            |

## Dialog.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| modal, modal-open, modal-box, ...        | DaisyUI   | Modal overlay, box, backdrop                    | Yes                 | Standard DaisyUI modal usage                                                            |
| bg-base-200, shadow-lg, rounded-lg       | DaisyUI   | Modal background, elevation, rounding           | Yes                 | Standard DaisyUI usage                                                                  |
| fixed, inset-0, flex, ...                | Tailwind  | Modal positioning, layout                       | Yes                 | Standard Tailwind, allowed per DaisyUI rules                                            |
| Scoped .modal-box CSS                    | Custom    | Modal box styling (max-width, padding, etc.)    | Partial              | DaisyUI modal-box, but with custom overrides                                            |
| TODO: Replace with DaisyUI Modal         | Comment   | Modal implementation                            | N/A                 | Should review for full DaisyUI compliance                                               |

## TaskDialog.vue (Partial, based on available lines)

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| (Not fully visible)                      |           |                                                 |                     | Most styling likely inherited from DialogTemplate/modal                                 |

## CommentInputPartial.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| flex, items-start, mr-3, w-8, ...        | Tailwind  | Layout, avatar sizing                           | Yes                 | Standard Tailwind, matches DaisyUI avatar pattern                                       |
| comment-input-wrapper, ... (BEM style)   | Custom    | Wrapper, avatar, placeholder                    | No                  | Not DaisyUI; could be replaced or documented                                            |
| not-permitted                            | Custom    | Disabled state                                  | No                  | Not DaisyUI; could use DaisyUI's disabled patterns                                      |

## TopBar.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| top-bar, bg-base-100, btn, ...           | DaisyUI   | Top bar, buttons, menus, dropdowns              | Yes                 | Standard DaisyUI usage                                                                  |
| w-full, flex, items-center, ...          | Tailwind  | Layout, spacing, sizing                         | Yes                 | Standard Tailwind, allowed per DaisyUI rules                                            |
| :style="{ backgroundColor: roleColor }"  | Inline    | User role badge color                           | No                  | Custom, but uses DaisyUI color variables                                                |

## ProjectView.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| tabs, tabs-border, tab, tab-active       | DaisyUI   | Tab navigation                                  | Yes                 | Standard DaisyUI usage                                                                  |
| w-full                                  | Tailwind  | Layout                                          | Yes                 | Standard Tailwind                                                                       |
| TODO: Replace with DaisyUI toast         | Comment   | Error notification                              | N/A                 | Should migrate to DaisyUI toast                                                         |

## ProjectBacklog.vue

| Class/Style                              | Type      | Context/Usage                                   | DaisyUI Counterpart | Notes                                                                                   |
|------------------------------------------|-----------|-------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| table, table-zebra, w-full, ...          | DaisyUI   | Table, zebra striping, sizing, background       | Yes                 | Standard DaisyUI usage                                                                  |
| hover:bg-base-200, cursor-pointer, ...   | DaisyUI   | Row hover, pointer, focus states                | Yes                 | Standard DaisyUI usage                                                                  |
| overflow-x-auto, px-6, py-4, ...         | Tailwind  | Table container, cell padding                   | Yes                 | Standard Tailwind                                                                       |
| backlog-wrapper, task__avatar--placeholder, drag-handle | Custom | Wrapper, avatar placeholder, drag handle        | No                  | Not DaisyUI; could be replaced or documented                                            |
| :style="{ height: tableHeight }"         | Inline    | Table container height                          | No                  | Custom, but necessary for resizable table                                               |
| TODO: Replace with DaisyUI Spinner/Toast | Comment   | Loading, error notification                     | N/A                 | Should migrate to DaisyUI spinner/toast                                                 |

---

### Narrative Summary

- **DaisyUI Usage:** Most major UI elements (cards, modals, tables, tabs, buttons, dropdowns) use DaisyUI classes as intended. This ensures theme compatibility and semantic color usage.
- **Tailwind Usage:** Layout, spacing, and sizing are handled with Tailwind utilities, which is allowed and recommended by DaisyUI when component classes are insufficient.
- **Custom Classes:** There are several BEM-style and legacy custom classes (e.g., task__tile, backlog-wrapper, kanban-task-list). These should be reviewed for possible replacement with DaisyUI/Tailwind, or documented as project-specific standards if they provide unique value.
- **Inline Styles:** Used sparingly, mostly for dynamic sizing or error output. Where possible, these should be replaced with DaisyUI or Tailwind equivalents for consistency.
- **TODOs:** There are several TODOs to migrate tooltips, spinners, and toasts to DaisyUI components. These should be prioritized for full DaisyUI compliance.
- **M3 Concepts:** The design uses M3-inspired patterns (elevation, color roles, rounded corners, focus states), but implements them with DaisyUI/Tailwind classes for maintainability.
- **Divergences:** The main divergences are custom classes and occasional use of Tailwind color utilities (e.g., text-red-500) instead of DaisyUI semantic colors. These should be standardized or documented.

--- 