# Kanban Styling Guidelines — Agent Companion

> **Purpose:** This document summarizes the most critical styling rules for AI agents and automation tools working on the Kanban frontend. It is designed for automated code review, code generation, and linting.

## Backgrounds & Containers
- **Page Background:** All pages must use the following Tailwind/DaisyUI gradient background:
  - `bg-gradient-to-br from-primary to-secondary to-80%`
- This should be applied to the main container or root element of every page/view for a consistent look.

---

## Quick Reference Checklist

- [ ] Use DaisyUI component classes for all standard UI elements (cards, modals, tables, tabs, etc.)
- [ ] Use Tailwind utilities for layout, spacing, and responsive design
- [ ] Prefer DaisyUI semantic color classes (e.g., `bg-primary`, `text-base-content`)
- [ ] Do NOT use Tailwind color classes for text/background unless DaisyUI semantic color is unavailable
- [ ] Only use custom classes or inline styles if DaisyUI/Tailwind cannot achieve the result
- [ ] All custom classes and inline styles must be commented and documented
- [ ] All divergences from the standard must be documented in code and audit
- [ ] Ensure all interactive elements are accessible (focusable, keyboard nav, contrast)

---

## 1. DaisyUI Usage
- Use DaisyUI component, part, and modifier classes for all standard UI elements.
- Use DaisyUI semantic color classes for backgrounds and text.
- Do not use `dark:` variants; DaisyUI handles theme switching.
- Do not add `bg-base-100 text-base-content` to `<body>` unless necessary.

## 2. Tailwind Usage
- Use Tailwind utilities for layout, spacing, sizing, and responsive design.
- Combine Tailwind with DaisyUI as needed (e.g., `btn px-10`).
- Use the `!` modifier (e.g., `bg-primary!`) only as a last resort for specificity.
- Do not write custom CSS unless absolutely necessary.

## 3. Material 3 (M3) Mapping
- Use DaisyUI `shadow-*` for elevation.
- Map M3 color roles to DaisyUI semantic colors.
- Use DaisyUI/Tailwind `rounded-*` for shape.
- Use Tailwind spacing scale for M3 spacing.

## 4. Custom Classes
- Only create custom classes if DaisyUI/Tailwind cannot achieve the result.
- Use BEM-style naming and prefix with component/feature name.
- All custom classes must have a code comment explaining their purpose.
- Document all custom classes in the styling audit.

## 5. Inline Styles
- Only use for dynamic values not possible with DaisyUI/Tailwind.
- Must be commented in code with justification.
- Review regularly for possible replacement.

## 6. Divergences & Exceptions
- Any divergence from these rules must be commented in code and documented in the audit.
- Include rationale for all exceptions.
- Minimize exceptions over time.

## 7. Accessibility
- All interactive elements must be focusable and keyboard accessible.
- Use DaisyUI focus utilities (e.g., `focus:outline-primary`).
- Use semantic color classes to ensure contrast.
- Use ARIA roles and attributes for custom components.
- Use DaisyUI tooltip for help text; ensure accessibility.

## 8. Component Patterns (Canonical Examples)
- Use the following as templates for automated code generation:

**Card:**
```html
<div class="card shadow-lg bg-base-100">
  <div class="card-body">
    <h2 class="card-title">Title</h2>
    <p>Content</p>
  </div>
</div>
```

**Modal:**
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

**Table:**
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

**Tabs:**
```html
<div role="tablist" class="tabs tabs-border">
  <button role="tab" class="tab tab-active">Tab 1</button>
  <button role="tab" class="tab">Tab 2</button>
</div>
```

**Tooltip:**
```html
<span class="tooltip" data-tip="Tooltip text">Hover me</span>
```

---

## 9. Review & Maintenance
- Agents should flag any code that does not comply with these rules.
- All changes to these rules must be proposed via pull request or team discussion.
- Review guidelines quarterly or after major UI changes.

--- 