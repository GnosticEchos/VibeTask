# UI Style Audit: Initial Findings (Global & Base Styles)

## 1. `src/styles/main.scss`
- **Purpose:** Base styles and PrimeVue compatibility fixes.
- **Key Points:**
  - Sets `html { font-size: 16px; }` (PrimeVue uses rem units, so this is appropriate).
  - Applies `-webkit-font-smoothing: antialiased;` to `body`.
  - Contains targeted fixes for PrimeVue components:
    - Focus box-shadow for `.p-dropdown`, `.p-inputtext`, `.p-button` using `var(--p-primary-color)`.
    - Adjusts icon spacing and positioning for `.p-select` and its children.
    - Adds pointer cursor for `.p-select-clear-icon`.
  - Uses `!important` in several places, which can make future overrides harder and may conflict with PrimeVue's design token system.
- **Notes:**
  - These are mostly compatibility/patch styles, not a full custom theme.
  - Some selectors are tightly coupled to PrimeVue's internal class names, which may break on library updates.

---

## 2. `src/styles/_reset.scss`
- **Purpose:** CSS resets for legacy PrimeVue theme issues.
- **Key Points:**
  - Resets `transform-origin` for several PrimeVue overlay components.
  - Resets `max-height` for dropdown and datatable wrappers.
- **Notes:**
  - These are targeted at fixing specific legacy issues, not general resets.
  - May be unnecessary or need review as you migrate to PrimeVue 4.x.

---

## 3. `src/styles/components/base/baseSelect.scss`
- **Purpose:** Custom styles for select components.
- **Key Points:**
  - Adds a green outline (`var(--p-success-color)`) to filled input wrappers, with `!important`.
  - Sets border-radius for the same.
  - Adjusts `.p-error` alignment and height.
  - Forces `.p-select` width to 100%.
- **Notes:**
  - Uses `!important` and direct PrimeVue class targeting.
  - The outline color is hardcoded to "success" rather than using a design token for focus/active state, which may not align with PrimeVue's theming best practices.

---

## 4. `src/styles/components/base/baseInput.scss`
- **Purpose:** Custom styles for input components.
- **Key Points:**
  - Forces `.p-inputtext` width to 100%.
- **Notes:**
  - Simple, but could be handled via layout or utility classes instead of global override.

---

## 5. `src/App.vue`
- **Styles:**
  - Global font-family set on `#app` via SCSS.
- **Notes:**
  - Minimal styling, no accessibility issues, no `!important` usage.

---

## 6. `src/components/layout/topbar/TopBar.vue`
- **Styles:**
  - Uses PrimeVue Menubar and Avatar.
  - Scoped SCSS for `.top-bar`, `.user-role`, `.icon--primary`, and deep selectors for `.p-menubar` and children.
  - All colors and backgrounds use PrimeVue CSS variables (e.g., `var(--p-surface-800)`, `var(--p-primary-color)`).
- **Notes:**
  - No `!important` usage.
  - Good use of design tokens.
  - Accessibility: Relies on PrimeVue components, which are accessible by default, but custom elements (e.g., user role badge) should be checked for contrast.

---

## 7. `src/components/layout/sidebar/SideBar.vue`
- **Styles:**
  - Extensive use of SCSS, all colors and spacing use PrimeVue variables.
  - Some `!important` usage in `.nested-menu-item` for background and color on hover/active.
  - Custom classes for menu item states (mini, rounded, selected, loading, etc.).
  - Uses `:deep` for PrimeVue PanelMenu overrides.
- **Notes:**
  - Most styling is token-driven, but `!important` is used for some state overrides.
  - Accessibility: Uses PrimeVue PanelMenu, but custom menu item templates should be checked for keyboard and ARIA compliance.

---

## 8. `src/views/ExploreProjectsView.vue`
- **Styles:**
  - Scoped SCSS for `.explore-menubar` and `.project-cards-container`.
  - Uses `:deep` for `.p-menubar` display tweaks.
- **Notes:**
  - No `!important` usage.
  - Minimal custom styling, mostly layout.
  - Accessibility: Relies on PrimeVue Menubar and Skeleton.

---

## 9. `src/views/DashboardWrapperView.vue`
- **Styles:**
  - Scoped SCSS for layout containers (`.app-wrapper`, `.main-container`, `.content-wrapper`, `.layout-sidebar`).
  - Uses flexbox and transitions.
- **Notes:**
  - No `!important` usage.
  - No color or font overrides; all layout.
  - Accessibility: No issues found.

---

## 10. `src/views/ProjectView.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - Purely a logic/view wrapper.

---

## 11. `src/views/LoginView.vue`
- **Styles:**
  - Scoped SCSS for background, logo, dialog, and signup callback.
  - Uses PrimeVue tokens for colors and backgrounds.
  - One use of `!important` for border on `.login-dialog`.
  - Custom animation for background gradient.
- **Notes:**
  - Mostly token-driven, but `!important` used for border.
  - Accessibility: Good contrast, but custom dialog should be checked for keyboard navigation and ARIA roles.

---

## 12. `src/views/PreferencesView.vue`
- **Styles:**
  - Scoped SCSS for `.preferences-view`, `.label`, and `.input-section`.
  - Uses PrimeVue tokens for border color.
- **Notes:**
  - No `!important` usage.
  - Minimal, layout-focused styling.
  - Accessibility: Relies on PrimeVue components.

---

## 13. `src/views/AccountView.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - No custom styles or accessibility concerns.

---

## 14. `src/views/HomeView.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - No custom styles or accessibility concerns.

---

## 15. `src/components/base/BasePasswordInput.vue`
- **Styles:**
  - Scoped SCSS, imports baseInput styles.
  - Uses PrimeVue tokens for color.
  - No `!important` usage.
- **Notes:**
  - Token-driven, leverages PrimeVue Password component.
  - Accessibility: Relies on PrimeVue, but custom label positions should be checked.

---

## 16. `src/components/base/BaseInput.vue`
- **Styles:**
  - Scoped SCSS, imports baseInput styles.
  - No `!important` usage.
- **Notes:**
  - Token-driven, leverages PrimeVue InputText component.
  - Accessibility: Relies on PrimeVue, custom error handling.

---

## 17. `src/components/base/BaseDoubleClickSelect.vue`
- **Styles:**
  - Scoped SCSS for label, field, and hover states.
  - Uses hardcoded color for field hover (`#2424307c`).
  - No `!important` usage.
- **Notes:**
  - Mostly custom, but minimal styling.
  - Accessibility: Custom interaction, should check for keyboard/ARIA support.

---

## 18. `src/components/base/BaseSelect.vue`
- **Styles:**
  - Scoped SCSS, imports baseSelect styles.
  - Uses `!important` for some deep selectors (clear icon, dropdown icon).
- **Notes:**
  - Token-driven, leverages PrimeVue Select component.
  - Accessibility: Relies on PrimeVue, but custom clear icon positioning.

---

## 19. `src/components/base/BaseButtonTabs.vue`
- **Styles:**
  - Scoped SCSS for tab, active state, and hover.
  - Uses custom variables (`--grayscale-darken6`, `--primary-base`).
  - No `!important` usage.
- **Notes:**
  - Custom, not token-driven.
  - Accessibility: Should check for keyboard navigation and ARIA roles.

---

## 20. `src/components/base/BaseDoubleClickInput.vue`
- **Styles:**
  - Scoped SCSS for input, value, placeholder, hover, and size.
  - Uses `!important` for placeholder font size.
  - Uses custom variables (`--primary-lighten`, `--field-hover-darken`).
- **Notes:**
  - Custom, not fully token-driven.
  - Accessibility: Custom interaction, should check for keyboard/ARIA support.

---

## 21. `src/components/base/BaseButton.vue`
- **Styles:**
  - Scoped SCSS for button, size, hover, and active states.
  - Uses v-bind for color/background, but not PrimeVue tokens.
  - Uses `!important` for some size/spacing.
- **Notes:**
  - Custom, not token-driven.
  - Accessibility: Relies on PrimeVue Button, but custom color/size.

---

## 22. `src/components/base/BaseSearch.vue`
- **Styles:**
  - Scoped SCSS, but no custom styles present.
- **Notes:**
  - Relies on PrimeVue InputText.
  - Accessibility: Relies on PrimeVue.

---

## 23. `src/components/base/BaseDialogTextarea.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - Relies on PrimeVue Dialog and Textarea.
  - Accessibility: Relies on PrimeVue.

---

## 24. `src/components/dashboard/board/Board.vue`
- **Styles:**
  - Scoped SCSS for layout, columns, and progress bar.
  - Uses PrimeVue tokens for most backgrounds and borders.
  - Uses `!important` for `.p-progressbar-value` and some table cell borders.
- **Notes:**
  - Mostly token-driven, but some custom/legacy color variables and `!important` for PrimeVue overrides.
  - Accessibility: Relies on PrimeVue for most interactive elements, but custom drag-and-drop and dialogs should be checked for ARIA/keyboard support.

---

## 25. `src/components/dashboard/columns/ColumnHeader.vue`
- **Styles:**
  - Scoped SCSS for header, name, color circle, and info icon.
  - Uses PrimeVue tokens for color.
  - No `!important` usage.
- **Notes:**
  - Token-driven, minimal custom styling.
  - Accessibility: Relies on PrimeVue, but custom tooltip/info icon should be checked for ARIA/keyboard support.

---

## 26. `src/components/dashboard/project/ProjectBacklog.vue`
- **Styles:**
  - Scoped SCSS for wrapper, task avatar, and datatable rows/cells.
  - Uses custom variables (`--grayscale-darken5`, `--primary-base-opacity`).
  - Uses `!important` for table cell border width.
- **Notes:**
  - Mix of custom and token-driven styles.
  - Accessibility: Relies on PrimeVue DataTable, but custom avatar/placeholder should be checked for alt text and ARIA.

---

## 27. `src/components/dashboard/explore/ProjectHierarchy.vue`
- **Styles:**
  - Scoped CSS for grid layout and card cursor.
  - No use of PrimeVue tokens; minimal custom styling.
  - No `!important` usage.
- **Notes:**
  - Minimal, layout-focused styling.
  - Accessibility: Relies on PrimeVue Dialog and Tag, but custom card click/double-click should be checked for keyboard/ARIA support.

---

## 28. `src/components/dashboard/explore/ProjectSummaryCard.vue`
- **Styles:**
  - Scoped CSS for card, header, body, progress bar, and status labels.
  - Uses hardcoded colors for background, border, and text (e.g., `#343a40`, `#495057`, `#ced4da`).
  - No `!important` usage.
- **Notes:**
  - Custom, not token-driven; should be refactored to use PrimeVue tokens for consistency.
  - Accessibility: Relies on PrimeVue Tag and ProgressBar, but custom color segments and status dots should be checked for contrast and ARIA.

---

## 29. `src/components/dashboard/explore/ProjectGrid.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - Relies on PrimeVue DataView, Card, Button, and Tag.
  - Accessibility: Relies on PrimeVue, but custom grid layout should be checked for keyboard navigation.

---

## 30. `src/components/dashboard/explore/UserTasks.vue`
- **Styles:**
  - No style block.
- **Notes:**
  - Relies on PrimeVue Chip.
  - Accessibility: Relies on PrimeVue, but custom router-link wrapping should be checked for keyboard navigation.

---

### General Observations (Layout & Views)
- Layout and top-level components are mostly using PrimeVue tokens and best practices.
- Sidebar uses some `!important` for state overrides, which should be reviewed.
- Accessibility is generally handled by PrimeVue, but custom templates and badges should be checked for contrast and ARIA compliance.

## General Observations
- Heavy use of `!important` and direct targeting of PrimeVue classes could cause maintainability issues.
- The use of a "success" color for outlines may not be accessible or thematically appropriate for all states.
- These files should be reviewed as you migrate to ensure they are still needed.
- A more sustainable, design-token-driven approach is recommended for future work.

---

## Updated Summary Triage Table

| File/Component                                 | Style Approach         | !important Usage | Accessibility Review Needed | Notes                                                      |
|------------------------------------------------|-----------------------|------------------|----------------------------|------------------------------------------------------------|
| src/styles/main.scss                           | Patch/Custom          | Yes              | No                         | Compatibility fixes, direct PrimeVue class targeting        |
| src/styles/_reset.scss                         | Patch/Custom          | No               | No                         | Legacy resets for PrimeVue overlays                        |
| src/styles/components/base/baseSelect.scss      | Custom                | Yes              | No                         | Success color for outline, direct class targeting          |
| src/styles/components/base/baseInput.scss       | Custom                | No               | No                         | Forces width, could use utility/layout class               |
| src/App.vue                                    | Minimal/Token         | No               | No                         | Only font-family override                                  |
| layout/topbar/TopBar.vue                       | PrimeVue Tokens       | No               | Maybe                      | Good token use, check badge contrast                       |
| layout/sidebar/SideBar.vue                     | PrimeVue Tokens/Custom| Yes (some)       | Maybe                      | Token-driven, !important for state, custom menu templates  |
| views/ExploreProjectsView.vue                  | PrimeVue Tokens       | No               | No                         | Minimal, layout only                                       |
| views/DashboardWrapperView.vue                 | Layout Only           | No               | No                         | Flexbox, no color/font overrides                           |
| views/ProjectView.vue                          | None                  | No               | No                         | No styles                                                  |
| views/LoginView.vue                            | PrimeVue Tokens/Custom| Yes (one)        | Maybe                      | Token-driven, !important for border, custom dialog         |
| views/PreferencesView.vue                      | PrimeVue Tokens       | No               | No                         | Minimal, layout only                                       |
| views/AccountView.vue                          | None                  | No               | No                         | No styles                                                  |
| views/HomeView.vue                             | None                  | No               | No                         | No styles                                                  |
| base/BasePasswordInput.vue                     | PrimeVue Tokens       | No               | Maybe                      | Token-driven, custom label positions                       |
| base/BaseInput.vue                             | PrimeVue Tokens       | No               | Maybe                      | Token-driven, custom error handling                        |
| base/BaseDoubleClickSelect.vue                 | Custom                | No               | Maybe                      | Custom, hardcoded hover color, custom interaction          |
| base/BaseSelect.vue                            | PrimeVue Tokens/Custom| Yes (deep)       | Maybe                      | Token-driven, !important for clear icon                    |
| base/BaseButtonTabs.vue                        | Custom                | No               | Maybe                      | Custom, not token-driven, check keyboard/ARIA              |
| base/BaseDoubleClickInput.vue                  | Custom                | Yes (one)        | Maybe                      | Custom, not fully token-driven, !important for placeholder |
| base/BaseButton.vue                            | Custom                | Yes (some)       | Maybe                      | Custom, not token-driven, v-bind for color                 |
| base/BaseSearch.vue                            | PrimeVue Tokens       | No               | No                         | Relies on PrimeVue InputText                               |
| base/BaseDialogTextarea.vue                    | PrimeVue Tokens       | No               | No                         | Relies on PrimeVue Dialog/Textarea                         |
| dashboard/board/Board.vue                      | PrimeVue Tokens/Custom| Yes (some)       | Maybe                      | Token-driven, !important for progressbar, drag-and-drop    |
| dashboard/columns/ColumnHeader.vue             | PrimeVue Tokens       | No               | Maybe                      | Token-driven, custom tooltip/info icon                     |
| dashboard/project/ProjectBacklog.vue           | Custom/PrimeVue Tokens| Yes (some)       | Maybe                      | Custom variables, !important for table cell borders        |
| dashboard/explore/ProjectHierarchy.vue         | Custom                | No               | Maybe                      | Minimal, layout only, custom card click/dblclick           |
| dashboard/explore/ProjectSummaryCard.vue       | Custom                | No               | Maybe                      | Hardcoded colors, not token-driven, custom progress/labels  |
| dashboard/explore/ProjectGrid.vue              | PrimeVue Tokens       | No               | Maybe                      | Relies on PrimeVue, custom grid layout                     |
| dashboard/explore/UserTasks.vue                | PrimeVue Tokens       | No               | Maybe                      | Relies on PrimeVue, router-link wrapping                   |

**Legend:**
- **Style Approach:** PrimeVue Tokens = uses design tokens; Custom = custom SCSS/CSS; Patch = compatibility/legacy fixes
- **!important Usage:** Yes = present, No = not present
- **Accessibility Review Needed:** Yes = custom templates or elements that may need ARIA/contrast review; No = handled by PrimeVue or not applicable
- **Notes:** Key findings or migration concerns 

---

## Conclusion and Recommendations

### Overall Findings
- The codebase contains a mix of PrimeVue token-driven styles, custom SCSS, and legacy patterns.
- There is moderate use of `!important` and direct class overrides, especially for PrimeVue component patches and some custom components.
- Some components use hardcoded colors or custom SCSS variables instead of PrimeVue design tokens, which may hinder theme consistency and maintainability.
- Accessibility is generally handled by PrimeVue, but custom templates, dialogs, and interactive elements should be reviewed for ARIA, keyboard navigation, and color contrast compliance.

### Key Risks
- Overuse of `!important` and direct class targeting may make future theming and maintenance difficult.
- Hardcoded colors and custom variables can break theme consistency, especially when switching themes or supporting dark mode.
- Custom interactive components (e.g., drag-and-drop, editable fields) may not fully meet accessibility standards without additional review.

### Actionable Next Steps
1. **Refactor Styles to Use PrimeVue Tokens:**
   - Replace hardcoded colors and custom variables with PrimeVue design tokens wherever possible.
   - Remove or refactor `!important` usages, relying on token-driven theming and component APIs.
2. **Audit and Enhance Accessibility:**
   - Review custom dialogs, tooltips, and interactive elements for ARIA roles, keyboard navigation, and color contrast.
   - Use PrimeVue's accessibility documentation as a reference for best practices.
3. **Component-by-Component Migration:**
   - Prioritize high-usage and high-visibility components for refactor.
   - Migrate custom and legacy styles to follow PrimeVue 4.x best practices.
4. **Continuous Validation:**
   - Test theming and accessibility changes across all supported themes (Aura, Lara, Material, Nora) and both light/dark modes.
   - Solicit user feedback and iterate as needed.

### Resources
- [PrimeVue 4.x Theming Guide](https://primevue.org/theming/styled/)
- [PrimeVue Accessibility Guide](https://primevue.org/guides/accessibility/)
- [PrimeVue Migration Guide](https://primevue.org/guides/migration/v4/)

This audit provides a clear roadmap for migrating to a modern, maintainable, and accessible theming system using PrimeVue 4.x. Future agents and maintainers should use this document as a reference for planning and executing the migration.

---

## PrimeVue Localization System

PrimeVue provides a flexible and reactive localization system for all UI components. Locale resources can be configured globally during PrimeVue setup, and updated at runtime for multi-language support. See the official documentation: [PrimeVue Locale Configuration](https://primevue.org/configuration/#locale)

### How to Configure

- Define your string resources in JSON files (e.g., `en.json`, `pl.json`) under `src/locale/`.
- During app initialization, load the appropriate locale file and pass it to PrimeVue:

```js
import PrimeVue from 'primevue/config';
import en from './locale/en.json';

app.use(PrimeVue, {
  locale: en
});
```

- To switch languages dynamically, update the PrimeVue locale object at runtime.

### Best Practices
- Keep all UI strings in the locale files (do not hardcode in components).
- Ensure all keys in `en.json` are present in other language files (e.g., `pl.json`).
- Use English as a fallback for missing translations.
- Regularly audit and update localization files as new UI features are added.

For more details, see the [PrimeVue Locale Documentation](https://primevue.org/configuration/#locale). 