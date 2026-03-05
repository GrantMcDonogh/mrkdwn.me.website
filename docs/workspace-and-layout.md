# Workspace & Layout

## Overview

The workspace system manages the visual layout of mrkdwn.me, including the sidebar, editor panes, tab bars, and right panels. It is powered by a React Context + `useReducer` pattern that provides a centralized, predictable state machine for all layout-related actions.

## State Management

**File:** `src/store/workspace.tsx`

### State Shape

```typescript
interface WorkspaceState {
  vaultId: Id<"vaults"> | null;
  panes: Pane[];
  activePaneId: string;
  splitDirection: "horizontal" | "vertical" | null;
  sidebarOpen: boolean;
  rightPanel: "backlinks" | "search" | "chat" | "history" | null;
  searchQuery: string;
}

interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

interface Tab {
  id: string;
  type: "note" | "graph";
  noteId?: Id<"notes">; // present when type === "note"
  mode?: "preview" | "edit"; // present when type === "note", defaults to "preview"
}
```

### Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `SET_VAULT` | `vaultId` | Set the active vault; initializes workspace |
| `LEAVE_VAULT` | — | Clear vault; return to vault selector |
| `OPEN_NOTE` | `noteId` | Open a note in the active pane (creates tab or activates existing) |
| `OPEN_GRAPH` | — | Open the graph view as a tab in the active pane (reactivates existing graph tab if present) |
| `CLOSE_TAB` | `paneId, tabId` | Close a tab in a specific pane |
| `SET_ACTIVE_TAB` | `paneId, tabId` | Switch active tab in a pane |
| `SET_ACTIVE_PANE` | `paneId` | Set which pane is focused |
| `SPLIT_PANE` | `direction` | Split the editor into two panes |
| `CLOSE_PANE` | `paneId` | Close a pane (returns to single-pane) |
| `TOGGLE_SIDEBAR` | — | Toggle left sidebar visibility |
| `SET_RIGHT_PANEL` | `panel` | Set right panel (backlinks/search/chat/history) or `null` to close |
| `SET_SEARCH_QUERY` | `query` | Update the search query string |
| `TOGGLE_TAB_MODE` | `paneId, tabId` | Toggle a note tab between preview and edit mode (no-op for graph tabs) |

### Reducer Logic

Key behaviors of the state reducer:

- **`OPEN_NOTE`**: If a tab for the note already exists in the active pane, it activates that tab. Otherwise, a new tab (with `type: "note"`, `mode: "preview"`) is created and activated.
- **`OPEN_GRAPH`**: If the active pane already has a graph tab, it activates that tab. Otherwise, a new tab (with `type: "graph"`) is created and activated. Only one graph tab per pane.
- **`CLOSE_TAB`**: Removes the tab. If it was the active tab, the previous tab becomes active. If no tabs remain, `activeTabId` is set to `null`.
- **`SPLIT_PANE`**: Creates a second pane. Maximum of 2 panes. If already split, this is a no-op.
- **`CLOSE_PANE`**: Removes the specified pane and reverts to single-pane mode. Tabs from the closed pane are discarded.
- **`TOGGLE_TAB_MODE`**: Finds the tab in the specified pane. If it's a note tab, toggles `mode` between `"preview"` and `"edit"`. No-op for graph tabs.
- **`SET_RIGHT_PANEL`**: If the same panel is set again, it toggles off (set to `null`).
- **`LEAVE_VAULT`**: Resets the entire workspace state to defaults.

### Context Provider

```tsx
<WorkspaceProvider>
  <AppLayout />
</WorkspaceProvider>
```

Components access state via:
- `useWorkspace()` — returns `[state, dispatch]`

---

## App Layout

**File:** `src/components/layout/AppLayout.tsx`

### Structure

```
┌───────────────────────────────────────────────────────────┐
│ Toolbar                                                   │
│ [≡ Sidebar] [Vault Name]      [Backlinks][Graph][🔍][💬]│
├────────┬──────────────────────────────┬───────────────────┤
│        │ Tab Bar (Pane 1)             │                   │
│  Side  │ [Note1] [Note2] [Graph]     │  Right Panel      │
│  bar   ├──────────────────────────────┤  (Backlinks /     │
│        │                              │   Search /        │
│  File  │ Editor / GraphView (Pane 1)  │   Chat)           │
│  Expl- │                              │                   │
│  orer  │                              │                   │
│        │                              │                   │
│        ├──────────────────────────────┤                   │
│        │ Tab Bar (Pane 2) — if split  │                   │
│        │ Editor (Pane 2)  — if split  │                   │
└────────┴──────────────────────────────┴───────────────────┘
```

### Toolbar

The toolbar spans the top of the layout and contains:

| Element | Position | Action |
|---------|----------|--------|
| Sidebar toggle button | Left | `TOGGLE_SIDEBAR` |
| Vault name | Center-left | Display only |
| Backlinks button | Right | `SET_RIGHT_PANEL("backlinks")` |
| Graph button | Right | `OPEN_GRAPH` (opens graph as editor tab) |
| Search button | Right | `SET_RIGHT_PANEL("search")` |
| Chat button | Right | `SET_RIGHT_PANEL("chat")` |
| History button | Right | `SET_RIGHT_PANEL("history")` |
| Audit Log button | Right | Opens audit log modal dialog |

Right-panel buttons toggle their respective panel. The graph button opens a graph tab in the active pane instead. The graph button is highlighted when the active tab is a graph tab; right-panel buttons are highlighted when their panel is open.

### Keyboard Shortcuts

Registered in `AppLayout`:

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + P` | Open Command Palette |
| `Ctrl/Cmd + O` | Open Quick Switcher |
| `Ctrl/Cmd + E` | Toggle Preview/Edit Mode on the active note tab |

---

## Sidebar

**File:** `src/components/layout/Sidebar.tsx`

### Behavior

- Controlled by `sidebarOpen` in workspace state.
- When open: renders the `VaultSwitcher` and either `FileExplorer` or `TrashPanel` with a fixed width (`w-60` / 240px).
- When closed: returns `null` (component is not rendered at all, not hidden with width 0).
- Toggled via the toolbar button or the command palette.
- A **Trash toggle** button at the bottom of the sidebar switches between the file explorer and the trash panel. Shows a count badge when items are in the trash.

### Vault Switcher

At the top of the sidebar, the `VaultSwitcher` component displays the current vault name with a dropdown for switching between vaults:

- Shows the current vault name with a `Vault` icon and `ChevronDown` indicator.
- Clicking the button toggles an inline dropdown listing all vaults.
- The active vault is marked with a `Check` icon.
- Clicking a different vault dispatches `SET_VAULT` to switch vaults (resets workspace).
- A "Download Vault" option exports the current vault as a `.zip` file (see [Download Vault](./download-vault.md)).
- A "Manage Vaults..." option at the bottom dispatches `LEAVE_VAULT` to return to the full-page vault selector.
- The dropdown closes when clicking outside of it.

### Layout

- Position: Left side of the app.
- Width: Fixed `w-60` (240px).
- Background: `obsidian-bg-secondary`.
- Border: Right border separating from editor area.
- Content: `VaultSwitcher` (top, separated by border) + `FileExplorer` or `TrashPanel` (toggled by trash button at bottom). See [file-explorer.md](./file-explorer.md) and [audit-log-version-history-trash.md](./audit-log-version-history-trash.md).

---

## Tab Bar

**File:** `src/components/layout/TabBar.tsx`

### Functionality

Each pane has its own tab bar displaying open tabs. Tabs can be either **note tabs** or **graph tabs**.

### Tab Appearance

| Element | Note Tab | Graph Tab |
|---------|----------|-----------|
| Icon | — | `GitFork` icon (size 14) |
| Label | Note title (fetched from note data) | "Graph" (static text) |
| Mode toggle | Eye/Pencil icon (size 12), visible on hover, between title and close button | — |
| Close button | Lucide `X` icon (size 12), visible on hover | Same |
| Active indicator | Background highlight on the active tab | Same |
| Inactive style | Muted background | Same |

The mode toggle icon reflects the tab's current mode: **Eye** icon when in preview mode, **Pencil** icon when in edit mode. Clicking it dispatches `TOGGLE_TAB_MODE`.

### Interactions

| Action | Behavior |
|--------|----------|
| Click tab | `SET_ACTIVE_TAB` — switches to that tab |
| Click mode icon | `TOGGLE_TAB_MODE` — toggles between preview and edit mode |
| Click close (×) | `CLOSE_TAB` — closes the tab |
| Click pane area | `SET_ACTIVE_PANE` — focuses that pane |

### Tab Lifecycle

1. **Open note** (`OPEN_NOTE`): If the note is already open in the active pane, that tab activates. Otherwise, a new note tab is appended and activated with `mode: "preview"` (notes open in preview mode by default).
2. **Open graph** (`OPEN_GRAPH`): If a graph tab already exists in the active pane, it activates. Otherwise, a new graph tab is created. Only one graph tab per pane.
3. **Close tab** (`CLOSE_TAB`): Tab is removed. If it was active, the previous sibling tab activates; if no previous sibling exists, the first remaining tab activates. If no tabs remain, `activeTabId` is set to `null` and the pane shows an empty state.
4. **Mode per tab**: Each note tab tracks its own `mode` ("preview" or "edit"). Switching tabs preserves each tab's mode independently.
5. **Multiple panes**: Each pane maintains its own independent list of tabs. The same note can be open in tabs across different panes.

---

## Split Pane

**File:** `src/components/layout/SplitPane.tsx`

### Functionality

The split pane system allows users to view two notes side-by-side by splitting the editor area.

### Split Modes

| Mode | Layout | Description |
|------|--------|-------------|
| `null` | Single pane | Default — one editor fills the space |
| `"vertical"` | Left \| Right | Two panes side-by-side |
| `"horizontal"` | Top / Bottom | Two panes stacked |

### Resizer

- A draggable divider between the two panes.
- **Drag**: Adjusts the split ratio.
- **Constraints**: Minimum 20%, maximum 80% for each pane.
- **Visual**: The divider has a hover highlight and cursor change (`col-resize` or `row-resize`).

### Implementation

1. The `SplitPane` component renders one or two child panes based on `splitDirection`.
2. Split ratio is maintained in local state (default: 50/50).
3. The resizer uses `onMouseDown` → `onMouseMove` → `onMouseUp` event handlers on the document.
4. Pane dimensions are set via `flex-basis` CSS with the calculated ratio.

### Pane Focus

- Only one pane is "active" at a time (tracked by `activePaneId`).
- Clicking anywhere in a pane sets it as active.
- The active pane determines where `OPEN_NOTE` creates new tabs.
- The active pane has a subtle visual distinction: `border border-obsidian-accent/20` (only shown when in split mode, i.e., `panes.length > 1`).

### Limitations

- Maximum of **2 panes** (no quad-split or complex layouts).
- Closing a pane reverts to single-pane mode.
- Pane state (tabs) is lost when a pane is closed.

---

## Right Panel

The right panel is a collapsible area on the right side of the layout that displays one of three components:

| Panel | Component | Description |
|-------|-----------|-------------|
| `"backlinks"` | `BacklinksPanel` | Backlinks and unlinked mentions for the active note |
| `"search"` | `SearchPanel` | Full-text search and tag filtering |
| `"chat"` | `ChatPanel` | RAG chat powered by Claude AI |
| `"history"` | `VersionHistory` | Version history for the active note |
| `null` | — | Panel hidden |

Note: The graph view is not in the right panel — it opens as a tab in the editor area (see Tab Bar above).

### Behavior

- Only one right panel can be visible at a time.
- Selecting the same panel again closes it (toggle behavior).
- The panel has a fixed width `w-72` (288px).
- Panel content updates reactively based on the active note and vault data.

---

## Responsive Behavior

The current layout is designed for **desktop viewports**:

- Sidebar, editor, and right panel are arranged horizontally.
- No mobile-specific layouts or breakpoints are implemented.
- The split pane resizer requires mouse interaction (no touch support).
