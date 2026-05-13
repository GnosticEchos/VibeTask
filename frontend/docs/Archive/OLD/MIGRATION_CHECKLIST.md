## Migration Checklist: PrimeVue to Flowbite

*   **Phase 1: PrimeVue Decommissioning (Core Cleanup)**
    *   [x] 1.a. Remove PrimeVue from `main.ts` (imports, `app.use(PrimeVue)`, related configs).
    *   [x] 1.b. Remove PrimeVue Toast (`ToastService` usage from `App.vue` and `useToast` from `layout.ts`).
    *   [x] 1.c. Clean up `package.json` (remove `primevue`, `@primeuix`, `primeicons`, `primeflex` dependencies).
    *   [x] 1.d. Clean up SCSS (remove PrimeVue-specific CSS from `main.scss` and `_reset.scss`).
*   **Phase 2: Sidebar Migration (Component-Specific)**
    *   [x] 2.a. Refactor `SideBar.vue` (use `<FwbSidebar>`, `<FwbSidebarItem>`, `<FwbSidebarDropdownItem>`).
    *   [x] 2.b. Configure `FwbSidebar` (`collapsed` prop binding).
    *   [x] 2.c. Apply Tailwind Theming (use semantic Tailwind color classes).
*   **Phase 3: Incremental Component Migration (Iterative)**
    *   [x] 3.a. Identify Next Component (ProjectMembers: `src/components/dashboard/project/ProjectMembers.vue`).
*   [x] 3.a. Identify Next Component (DangerZone: `src/components/dashboard/project/settings/partials/DangerZone.vue`).
*   [x] 3.b. Research Flowbite Equivalent.
*   [x] 3.c. Implement Migration.
*   [x] 3.d. Verify.
