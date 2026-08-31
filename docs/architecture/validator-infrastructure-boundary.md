# Live generation infrastructure boundary

The live-generation ownership validator protects only explicit infrastructure ownership:

- preview bootstrap (`src/main.tsx`);
- router ownership APIs and route contracts unless a manifest explicitly makes the contract a product slot;
- provider ownership (`*Provider` from context/provider modules);
- root navigation owners such as `BottomTabs`, `Sidebar`, `TopBar`, and `NavigationShell`;
- root layout owners such as `AppShell` and `DashboardShell`.

`skeletonOwned` / `agentReadOnly` means the agent cannot edit those files. It does not make those files an import-protected shell surface. Product code may consume reusable read-only components, hooks, helpers, and context consumer APIs.

When no explicit generated delta is available, boundary validation inspects manifest product slots only rather than inferring ownership from the skeleton-owned file set.
