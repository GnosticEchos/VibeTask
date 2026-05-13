# Button Color Audit & Theming Findings

## Preferences Page

| Button Text | Class Names | Computed Background Color | Notes |
|-------------|-------------|--------------------------|-------|
| (icon only) | p-button p-component p-button-icon-only p-button--small | rgb(63, 81, 181) | Indigo (matches theme) |
| Aura        | p-button p-component theme-btn selected | rgb(16, 185, 129) | Green (PrimeVue default, not theme) |
| Material    | p-button p-component theme-btn         | rgb(16, 185, 129) | Green (PrimeVue default, not theme) |
| Lara        | p-button p-component theme-btn         | rgb(16, 185, 129) | Green (PrimeVue default, not theme) |
| Nora        | p-button p-component theme-btn         | rgb(16, 185, 129) | Green (PrimeVue default, not theme) |
| Edit Light  | p-button p-component selected          | rgb(227, 242, 253) | Light blue (matches indigo palette) |
| Edit Dark   | p-button p-component                   | rgb(16, 185, 129) | Green (PrimeVue default, not theme) |
| Apply       | p-button p-component apply-btn         | rgb(25, 118, 210) | Indigo (matches theme) |
| Button      | p-button p-component                   | rgb(63, 81, 181) | Indigo (matches theme) |

**Findings:**
- Most buttons use the correct theme color (indigo).
- Theme selection and "Edit Dark" buttons use PrimeVue's default green, not the theme color.
- These buttons do not pass a color or severity prop, so they use the preset's default.

**Recommendation:**
- Add `severity="primary"` or a style override to these buttons to use the theme color.

---

## Dashboard Page

| Button Text | Class Names | Computed Background Color | Notes |
|-------------|-------------|--------------------------|-------|
| Sign up     | p-button p-component mt-2             | rgba(0, 0, 0, 0) | Transparent, uses var(--color-primary) |

**Findings:**
- The button uses the correct variable, but the computed color is transparent (may be due to missing variable value or parent style).

---

## Board Page

| Button Text | Class Names | Computed Background Color | Notes |
|-------------|-------------|--------------------------|-------|
| Sign up     | p-button p-component mt-2             | rgba(0, 0, 0, 0) | Transparent, uses var(--color-primary) |

**Findings:**
- Only a "Sign up" button was found on the board page.
- The button uses the correct variable, but the computed color is transparent (may be due to missing variable value or parent style).

## Board Page (Detailed)

| Button Text         | Class Names                                         | Computed Background Color | Notes |
|---------------------|----------------------------------------------------|--------------------------|-------|
| (icon only)         | p-button p-component p-button-icon-only p-button--small | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |
| Restore initial state | p-button p-component                              | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |
| Save changes        | p-button p-component                               | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |
| Add new column      | p-button p-component                               | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |
| (icon only, x4)     | p-button p-component p-button-icon-only ml-2 p-button--small ml-2 | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |
| Delete project      | p-button p-component                               | rgb(237, 0, 0)           | Hardcoded red, not theme variable |

**Findings:**
- Most buttons use `var(--color-primary)` for background, but the computed color is transparent, indicating a possible missing or unset variable.
- The "Delete project" button uses a hardcoded red (`rgb(237, 0, 0)`), not a theme variable.

**Recommendation:**
- Investigate why `--color-primary` is not set or is transparent on this page.
- Refactor the "Delete project" button to use `var(--color-error)` or another theme variable for error/danger actions.

---

## New Page

| Button Text | Class Names                                         | Computed Background Color | Notes |
|-------------|----------------------------------------------------|--------------------------|-------|
| (icon only) | p-button p-component p-button-icon-only p-button--small | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |

**Findings:**
- The button uses `var(--color-primary)` for background, but the computed color is transparent, indicating a possible missing or unset variable.

---

## Next New Page

| Button Text | Class Names                                         | Computed Background Color | Notes |
|-------------|----------------------------------------------------|--------------------------|-------|
| (icon only) | p-button p-component p-button-icon-only p-button--small | rgba(0, 0, 0, 0)         | Uses var(--color-primary), but is transparent |

**Findings:**
- The button uses `var(--color-primary)` for background, but the computed color is transparent, indicating a possible missing or unset variable.

---

## Next Steps
- Update PreferencesView.vue to add `severity="primary"` or a style override to theme selection and "Edit Dark" buttons.
- Continue auditing other pages for button theming consistency.

## Latest Page

| Button Text | Class Names                | Computed Background Color | Notes |
|-------------|---------------------------|--------------------------|-------|
| (icon only) | p-button p-component p-button-icon-only p-button--small | rgba(0, 0, 0, 0) | Uses var(--color-primary), but is transparent |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |
| View Board  | p-button p-component w-full | rgb(16, 185, 129)        | Green, not using theme's primary color |

**Findings:**
- The icon-only button uses `var(--color-primary)` for background, but the computed color is transparent (possible unset variable).
- All 'View Board' buttons are green (`rgb(16, 185, 129)`), not using the theme's primary color.

**Recommendation:**
- Investigate why 'View Board' buttons are not using the theme's primary color and update their styling to use the correct variable. 