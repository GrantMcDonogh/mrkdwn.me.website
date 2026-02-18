# Search & Command Palette

## Overview

mrkdwn.me provides three search and navigation mechanisms:

1. **Search Panel** — Full-text search across note titles and content, with tag filtering.
2. **Command Palette** — Quick access to application commands via keyboard shortcut.
3. **Quick Switcher** — Fuzzy-search note finder for rapid navigation.

---

## Search Panel

**File:** `src/components/search/SearchPanel.tsx`

### Functionality

The Search Panel enables users to search across all notes in the active vault by title and content. It also extracts and displays tags for filtering.

### Full-Text Search

- **Backend**: Uses Convex's built-in search indexes defined in `convex/schema.ts`:
  ```typescript
  .searchIndex("search_content", { searchField: "content", filterFields: ["vaultId"] })
  .searchIndex("search_title", { searchField: "title", filterFields: ["vaultId"] })
  ```
- **API**: `notes.search({ vaultId, query })` performs server-side full-text search (dual-index: searches both `search_title` and `search_content`, merges and deduplicates results, title matches prioritized).
- **Behavior**:
  1. User types a query in the search input.
  2. The search query is stored in the workspace state (`searchQuery`).
  3. `useQuery(api.notes.search, { vaultId, query })` fires reactively.
  4. Results are displayed as a list of matching notes with context.

### Search Results

Each result displays:

| Element | Description |
|---------|-------------|
| Note title | Clickable — opens the note in the editor |
| Content preview | The first 150 characters of the note's content (`note.content.slice(0, 150)`) |

- Clicking a result dispatches `OPEN_NOTE` to open the note.
- Results are limited to 20 items.

### Tag System

Tags are extracted from note content using the `#tag-name` pattern:

#### Tag Extraction

1. All notes in the vault are fetched.
2. A regex (`/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g`) scans each note's content for tag patterns. The `#` must be preceded by whitespace or start of string, followed by a letter, then letters/digits/underscores/hyphens.
3. Tags are aggregated with their occurrence count.
4. Displayed as clickable pills in the search panel.

#### Tag Filtering

- Clicking a tag sets it as the search query (e.g., clicking `#project` searches for `#project`).
- Tags are displayed with their count: `#project (5)`.
- Tags are sorted by frequency (most common first).

### UI Structure

```
Search Panel
├── Search Input
│   └── [🔍] Text input with placeholder "Search notes..."
├── Tag Cloud
│   ├── #tag1 (3)
│   ├── #tag2 (7)
│   └── #tag3 (1)
├── Search Results
│   ├── Result 1: [Note Title] — first 150 chars of content
│   ├── Result 2: [Note Title] — first 150 chars of content
│   └── ...
└── (Empty states: "Searching..." while loading, "No results found" when search returns empty, or "Type to search" when no query and no tags)
```

### Panel Placement

- Displayed in the **right panel** of the app layout.
- Toggled via workspace state: `rightPanel === "search"`.
- Activated through toolbar button or command palette.

---

## Command Palette

**File:** `src/components/command-palette/CommandPalette.tsx`

### Activation

- **Keyboard shortcut**: `Ctrl+P` (Windows/Linux) / `Cmd+P` (macOS)
- Opens as a modal overlay centered on the screen.

### UI Structure

```
Command Palette Modal
├── Search Input (auto-focused, placeholder: "Type a command...")
├── Command List (filtered)
│   ├── ▸ Toggle Sidebar
│   ├── ▸ Split Editor Vertically
│   ├── ▸ Split Editor Horizontally
│   ├── ▸ Toggle Backlinks Panel
│   ├── ▸ Toggle Graph View
│   ├── ▸ Toggle Search
│   ├── ▸ Toggle Chat
│   └── ▸ Switch Vault
└── (Close on Escape or click outside)
```

### Available Commands

| Command | Action | Workspace Dispatch |
|---------|--------|-------------------|
| Toggle Sidebar | Show/hide left sidebar | `TOGGLE_SIDEBAR` |
| Split Editor Vertically | Split into vertical panes | `SPLIT_PANE` (vertical) |
| Split Editor Horizontally | Split into horizontal panes | `SPLIT_PANE` (horizontal) |
| Toggle Backlinks Panel | Show/hide backlinks in right panel | `{ type: "SET_RIGHT_PANEL", panel: "backlinks" }` |
| Toggle Graph View | Show/hide graph in right panel | `{ type: "SET_RIGHT_PANEL", panel: "graph" }` |
| Toggle Search | Show/hide search in right panel | `{ type: "SET_RIGHT_PANEL", panel: "search" }` |
| Toggle Chat | Show/hide chat in right panel | `{ type: "SET_RIGHT_PANEL", panel: "chat" }` |
| Switch Vault | Return to vault selector | `LEAVE_VAULT` |

### Interaction

| Action | Behavior |
|--------|----------|
| Type in input | Filters commands by name (case-insensitive substring match) |
| Arrow Up/Down | Navigate through filtered commands |
| Enter | Execute the highlighted command |
| Escape | Close the palette without executing |
| Click outside | Close the palette |
| Click command | Execute that command |

### Implementation Details

- The command list is defined as a static array of `{ name, action }` objects.
- Filtering is done with a simple `toLowerCase().includes()` check.
- Keyboard navigation tracks a `selectedIndex` via arrow keys.
- On execute, the command's action function is called, and the palette closes.

---

## Quick Switcher

**File:** `src/components/command-palette/QuickSwitcher.tsx`

### Activation

- **Keyboard shortcut**: `Ctrl+O` (Windows/Linux) / `Cmd+O` (macOS)
- Opens as a modal overlay (similar to command palette).

### Purpose

Provides fuzzy search across all note titles for quick navigation. This is optimized for speed — users can find and open any note in the vault with just a few keystrokes.

### Fuzzy Search Algorithm

The quick switcher implements a custom fuzzy matching algorithm:

1. **Input**: User's query string and a note title.
2. **Matching**: Characters in the query are matched sequentially against the title (case-insensitive).
3. **Scoring factors**:
   - **Consecutive matches**: Bonus for sequential character matches.
   - **Substring match**: Bonus if the query is a direct substring of the title.
   - **Position bonus** (substring matches only): Earlier position of the exact substring in the title scores higher (`1000 - indexOf`). Does not apply to fuzzy matches.
4. **Ranking**: Results are sorted by score (descending).
5. **Limit**: Top 20 results are displayed.

### UI Structure

```
Quick Switcher Modal
├── Search Input (auto-focused, placeholder: "Find a note...")
├── Results List (fuzzy-filtered)
│   ├── 📄 Note Title 1
│   ├── 📄 Note Title 2
│   └── ...
└── (Close on Escape or click outside)
```

### Interaction

| Action | Behavior |
|--------|----------|
| Type in input | Fuzzy-filters notes by title |
| Arrow Up/Down | Navigate results |
| Enter | Open the highlighted note |
| Escape | Close the switcher |
| Click result | Open that note |

### Data Source

- All notes in the active vault are fetched via `useQuery(api.notes.list, { vaultId })`.
- Filtering and scoring are done client-side for instant responsiveness.
- No server round-trip is needed for each keystroke.

---

## Keyboard Shortcuts Summary

| Shortcut | Feature |
|----------|---------|
| `Ctrl/Cmd + P` | Open Command Palette |
| `Ctrl/Cmd + O` | Open Quick Switcher |
| `Ctrl/Cmd + F` | Find in editor (CodeMirror built-in search) |

`Ctrl+P` and `Ctrl+O` are registered as global `keydown` event listeners in the `AppLayout` component. `Ctrl+F` is a built-in CodeMirror keybinding, not registered by the application.
