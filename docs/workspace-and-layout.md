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
  rightPanel: "backlinks" | "graph" | "search" | "chat" | null;
  searchQuery: string;
}

interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

interface Tab {
  id: string;
  noteId: Id<"notes">;
}
```

### Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `SET_VAULT` | `vaultId` | Set the active vault; initializes workspace |
| `LEAVE_VAULT` | — | Clear vault; return to vault selector |
| `OPEN_NOTE` | `noteId` | Open a note in the active pane (creates tab or activates existing) |
| `CLOSE_TAB` | `paneId, tabId` | Close a tab in a specific pane |
| `SET_ACTIVE_TAB` | `paneId, tabId` | Switch active tab in a pane |
| `SET_ACTIVE_PANE` | `paneId` | Set which pane is focused |
| `SPLIT_PANE` | `direction` | Split the editor into two panes |
| `CLOSE_PANE` | `paneId` | Close a pane (returns to single-pane) |
| `TOGGLE_SIDEBAR` | — | Toggle left sidebar visibility |
| `SET_RIGHT_PANEL` | `panel` | Set right panel (backlinks/graph/search/chat) or `null` to close |
| `SET_SEARCH_QUERY` | `query` | Update the search query string |

### Reducer Logic

Key behaviors of the state reducer:

- **`OPEN_NOTE`**: If a tab for the note already exists in the active pane, it activates that tab. Otherwise, a new tab is created and activated.
- **`CLOSE_TAB`**: Removes the tab. If it was the active tab, the previous tab becomes active. If no tabs remain, `activeTabId` is set to `null`.
- **`SPLIT_PANE`**: Creates a second pane. Maximum of 2 panes. If already split, this is a no-op.
- **`CLOSE_PANE`**: Removes the specified pane and reverts to single-pane mode. Tabs from the closed pane are discarded.
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
│  Side  │ [Tab1] [Tab2] [Tab3]        │  Right Panel      │
│  bar   ├──────────────────────────────┤  (Backlinks /     │
│        │                              │   Graph /         │
│  File  │ Editor (Pane 1)              │   Search /        │
│  Expl- │                              │   Chat)           │
│  orer  │ MarkdownEditor               │                   │
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
| Graph button | Right | `SET_RIGHT_PANEL("graph")` |
| Search button | Right | `SET_RIGHT_PANEL("search")` |
| Chat button | Right | `SET_RIGHT_PANEL("chat")` |

Each right-panel button toggles its respective panel. The active panel button is visually highlighted.

### Keyboard Shortcuts

Registered in `AppLayout`:

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + P` | Open Command Palette |
| `Ctrl/Cmd + O` | Open Quick Switcher |

---

## Sidebar

**File:** `src/components/layout/Sidebar.tsx`

### Behavior

- Controlled by `sidebarOpen` in workspace state.
- When open: renders the `FileExplorer` component with a fixed width (`w-60` / 240px).
- When closed: returns `null` (component is not rendered at all, not hidden with width 0).
- Toggled via the toolbar button or the command palette.

### Layout

- Position: Left side of the app.
- Width: Fixed `w-60` (240px).
- Background: `obsidian-bg-secondary`.
- Border: Right border separating from editor area.
- Content: The `FileExplorer` component (see [file-explorer.md](./file-explorer.md)).

---

## Tab Bar

**File:** `src/components/layout/TabBar.tsx`

### Functionality

Each pane has its own tab bar displaying the open notes as tabs.

### Tab Appearance

| Element | Description |
|---------|-------------|
| Tab label | Note title (fetched from note data) |
| Close button | Lucide `X` icon (size 12), visible on hover via `opacity-0 group-hover:opacity-100` |
| Active indicator | Background highlight on the active tab |
| Inactive style | Muted background |

### Interactions

| Action | Behavior |
|--------|----------|
| Click tab | `SET_ACTIVE_TAB` — switches to that tab |
| Click close (×) | `CLOSE_TAB` — closes the tab |
| Click pane area | `SET_ACTIVE_PANE` — focuses that pane |

### Tab Lifecycle

1. **Open note** (`OPEN_NOTE`): If the note is already open in the active pane, that tab activates. Otherwise, a new tab is appended and activated.
2. **Close tab** (`CLOSE_TAB`): Tab is removed. If it was active, the previous sibling tab activates; if no previous sibling exists, the first remaining tab activates. If no tabs remain, `activeTabId` is set to `null` and the pane shows an empty state.
3. **Multiple panes**: Each pane maintains its own independent list of tabs. The same note can be open in tabs across different panes.

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
| `"graph"` | `GraphView` | Force-directed graph of note relationships |
| `"search"` | `SearchPanel` | Full-text search and tag filtering |
| `"chat"` | `ChatPanel` | RAG chat powered by Claude AI |
| `null` | — | Panel hidden |

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
