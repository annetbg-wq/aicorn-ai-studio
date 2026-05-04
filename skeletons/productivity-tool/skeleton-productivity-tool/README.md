# Productivity Tool Skeleton

Production-grade React + TypeScript skeleton for project / task management products
(Linear-, Notion-, Jira-style).

## Layout

- **Sidebar** — collapsible. Two zones: static filters (All / Inbox / Starred / Archive) + dynamic workspace list with item counts.
- **Top bar** — title + global search trigger (`⌘K`) + status/priority filters + Kanban/List toggle + New button.
- **Main** — Workspace page renders Kanban or List based on `view` mode.
- **Global overlays**:
  - **Item detail Sheet** — opens from any card click; status, assignee, due date, tags.
  - **Command palette** — `⌘K` opens; fuzzy search across items + workspaces; ↑↓↵.

## What's wired

- `useKeyboard` — global shortcut hook with input-focus aware behavior.
- `useCommandPalette` — pure search state across items + workspaces.
- Native HTML5 drag-and-drop on Kanban: cards are draggable, columns accept drops, status updates optimistically.
- Persisted: active workspace, view mode, sidebar collapsed, filter values, theme.
- All 11 UI primitives.

## Pages

- **Workspace** — same component for `/` (all) and `/workspace/:id` (single).

## Running

```bash
npm install
npm run dev
npm run typecheck
npm run validate    # checks Cmd+K wiring, no any, no console, no hardcoded colors
npm run build
```

## Customization

1. Edit `src/config/app.ts` — name, tagline.
2. Replace seed in `src/data/seed.ts` with real workspaces / items / tags.
3. The agent extends:
   - Wire `setItemStatus` to your persistence layer.
   - Add subtasks, comments, attachments, activity log inside `ItemDetailSheet`.
   - Add a "New item" form (button is wired in TopBar).
