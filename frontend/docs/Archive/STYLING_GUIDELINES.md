# Kanban Styling Guidelines

> **Version:** Draft 1.0
> **Scope:** Kanban Frontend (Vue 3, DaisyUI, Tailwind CSS, M3-inspired)

---

## Backgrounds & Containers
- **Page Background:** All pages must use the following Tailwind/DaisyUI gradient background for visual consistency:
  - `bg-gradient-to-br from-primary to-secondary to-80%`
- This should be applied to the main container or root element of every page/view.

---

## Quick Reference

- Use DaisyUI component classes for all standard UI elements (cards, modals, tables, tabs, etc.)
- Use Tailwind utilities for layout, spacing, and responsive design
- Prefer DaisyUI semantic color classes (e.g., `bg-primary`, `text-base-content`)
- Only use custom classes or inline styles when DaisyUI/Tailwind cannot achieve the result
- Document and justify all divergences from the standard
- Follow accessibility best practices (focus, contrast, keyboard nav)

---

## Table of Contents
1. [Introduction & Philosophy](#introduction--philosophy)
2. [DaisyUI Usage](#daisyui-usage)
3. [Tailwind Usage](#tailwind-usage)
4. [Material 3 (M3) Guidance](#material-3-m3-guidance)
5. [Custom Classes & Extensions](#custom-classes--extensions)
6. [Inline Styles](#inline-styles)
7. [Divergences & Exceptions](#divergences--exceptions)
8. [Accessibility & UX](#accessibility--ux)
9. [Component Examples & Patterns](#component-examples--patterns)
10. [Review & Maintenance](#review--maintenance)

---

## 1. Introduction & Philosophy

Our Kanban frontend styling guidelines are designed to ensure:
- **Consistency**: All UI elements look and behave predictably across the app.
- **Maintainability**: Styles are easy to update, extend, and reason about.
- **Accessibility**: The UI is usable by everyone, including keyboard and screen reader users.
- **Modern Aesthetics**: We leverage DaisyUI and Tailwind for rapid, themeable development, while applying Material 3 (M3) design principles for clarity, elevation, and color.

**Core Principles:**
- Prefer DaisyUI and Tailwind over custom CSS.
- Use semantic color and component classes for theme support.
- Document and justify any divergence from these standards.

---

## 2. DaisyUI Usage

### 2.1. Component Classes
- Use DaisyUI component classes (e.g., `card`, `modal`, `table`, `tabs`, `btn`) for all standard UI elements.
- Use DaisyUI part classes (e.g., `card-body`, `modal-action`) for internal structure.
- Use DaisyUI modifiers (e.g., `card-side`, `tab-active`, `table-zebra`) for variants.

### 2.2. Color System
- Use DaisyUI semantic color classes (e.g., `bg-primary`, `text-base-content`, `bg-base-100`).
- Avoid Tailwind color classes (e.g., `bg-red-500`) unless DaisyUI does not provide a suitable semantic color.
- Use `*-content` color classes for text to ensure contrast with backgrounds.
- Do not use `dark:` variants; DaisyUI handles theme switching automatically.

### 2.3. Theming
- Use DaisyUI's theme system for light/dark and custom themes.
- Do not hardcode colors; always use semantic classes.

### 2.4. Best Practices
- Do not add `bg-base-100 text-base-content` to `<body>` unless necessary.
- Use DaisyUI's accessibility features (e.g., focus, contrast).
- Refer to [DaisyUI documentation](https://daisyui.com/components/) for up-to-date class names and usage.

---

## 3. Tailwind Usage

### 3.1. Layout & Spacing
- Use Tailwind utilities for layout (e.g., `flex`, `grid`, `gap-x-4`, `justify-center`).
- Use responsive prefixes (`sm:`, `md:`, `lg:`, etc.) for adaptive layouts.
- Use Tailwind for spacing, sizing, and positioning when DaisyUI does not provide a component or modifier.

### 3.2. Combining with DaisyUI
- It is acceptable to combine Tailwind utilities with DaisyUI classes (e.g., `btn px-10`).
- If DaisyUI and Tailwind styles conflict, use the `!` modifier (e.g., `bg-primary!`) as a last resort.
- Do not write custom CSS unless absolutely necessary.

### 3.3. Responsive Design
- All layouts should be responsive by default.
- Use Tailwind's responsive utilities to ensure usability on all screen sizes.

---

## 4. Material 3 (M3) Guidance

### 4.1. Elevation
- Use DaisyUI's `shadow-*` classes to represent elevation (e.g., `shadow-lg` for cards, modals).
- Avoid custom box-shadow unless DaisyUI cannot achieve the desired effect.

### 4.2. Color Roles
- Map M3 color roles to DaisyUI semantic colors (e.g., M3 "Primary" → `bg-primary`).
- Use `base-*` for surfaces, `primary` for key actions, and `secondary`/`accent` for highlights.

### 4.3. Shape & Corners
- Use DaisyUI's `rounded-*` classes for shape (e.g., `rounded-lg` for modals, cards).
- Follow M3 guidance for corner radii, but use DaisyUI/Tailwind classes for implementation.

### 4.4. Spacing & Layout
- Use Tailwind's spacing scale to approximate M3 spacing.
- Maintain consistent padding and margin across components.

### 4.5. Motion
- Use Tailwind's transition and animation utilities for simple effects.
- Avoid custom animations unless required for accessibility or branding.

---

## 5. Custom Classes & Extensions

### 5.1. When Allowed
- Only create custom classes if DaisyUI and Tailwind cannot achieve the required result.
- All custom classes must be documented in the code and in the styling audit.

### 5.2. Naming Conventions
- Use BEM-style naming (e.g., `kanban-task-list`, `comment-input-wrapper`).
- Prefix with the component or feature name to avoid collisions.

### 5.3. Documentation
- Every custom class must have a comment explaining its purpose.
- Custom classes should be reviewed regularly for possible replacement with DaisyUI/Tailwind.

---

## 6. Inline Styles

### 6.1. When Allowed
- Only use inline styles for dynamic values that cannot be expressed with DaisyUI/Tailwind (e.g., dynamic height).
- Avoid inline styles for static values; prefer utility classes.

### 6.2. Documentation
- Inline styles must be commented in the code, explaining why they are necessary.
- Inline styles should be reviewed regularly for possible replacement.

---

## 7. Divergences & Exceptions

### 7.1. Documentation
- Any divergence from these guidelines must be documented in the code and in the styling audit.
- Include a rationale for why the divergence is necessary.

### 7.2. Review Process
- Divergences should be reviewed during code review and periodically during styling audits.
- The goal is to minimize exceptions over time.

---

## 8. Accessibility & UX

### 8.1. Focus & Keyboard Navigation
- All interactive elements must be focusable and usable via keyboard.
- Use DaisyUI's focus utilities (e.g., `focus:outline-primary`).

### 8.2. Color Contrast
- Use DaisyUI's semantic color classes to ensure contrast.
- Avoid Tailwind color classes for text/background unless contrast is verified.

### 8.3. ARIA & Roles
- Use appropriate ARIA roles and attributes for custom components.
- Follow WAI-ARIA best practices for dialogs, modals, and navigation.

### 8.4. Tooltips & Help
- Use DaisyUI's tooltip component for hints and help text.
- Ensure tooltips are accessible to keyboard and screen reader users.

---

## 9. Component Examples & Patterns

### 9.1. Cards
```html
<div class="card shadow-lg bg-base-100">
  <div class="card-body">
    <h2 class="card-title">Title</h2>
    <p>Content</p>
  </div>
</div>
```

### 9.2. Modals
```html
<div class="modal modal-open">
  <div class="modal-box bg-base-200 shadow-lg rounded-lg">
    <h3 class="font-bold text-lg">Modal Title</h3>
    <p>Modal content</p>
    <div class="modal-action">
      <button class="btn">Close</button>
    </div>
  </div>
</div>
```

### 9.3. Tables
```html
<div class="overflow-x-auto">
  <table class="table table-zebra w-full bg-base-100">
    <thead>
      <tr><th>Header</th></tr>
    </thead>
    <tbody>
      <tr><td>Row</td></tr>
    </tbody>
  </table>
</div>
```

### 9.4. Tabs
```html
<div role="tablist" class="tabs tabs-border">
  <button role="tab" class="tab tab-active">Tab 1</button>
  <button role="tab" class="tab">Tab 2</button>
</div>
```

### 9.5. Tooltips
```html
<span class="tooltip" data-tip="Tooltip text">Hover me</span>
```

---

## 10. Review & Maintenance

### 10.1. Proposing Changes
- All changes to these guidelines must be proposed via pull request or team discussion.
- Include rationale and examples for any new rules or exceptions.

### 10.2. Review Cadence
- Guidelines should be reviewed quarterly or after major UI changes.
- Styling audits should be performed at least twice a year.

### 10.3. Keeping Up to Date
- Monitor DaisyUI and Tailwind releases for new features and deprecations.
- Update guidelines as needed to reflect best practices.

---

## Appendix: Agent-Friendly Reference (Planned)

*A companion document for AI agents and automation tools, summarizing the most critical rules and conventions for automated code review and generation.*

--- 