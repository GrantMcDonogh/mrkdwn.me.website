# File Explorer

## Overview

The File Explorer is a tree-view sidebar component that displays the hierarchical structure of folders and notes within the active vault. Users can create, rename, delete, and reorganize folders and notes through this panel. It closely mirrors the file explorer found in the desktop Obsidian application.

## Data Models

### Folders (`convex/schema.ts`)

```typescript
folders: defineTable({
  name: v.string(),
  parentId: v.optional(v.id("folders")),
  vaultId: v.id("vaults"),
  order: v.number(),
})
  .index("by_vault", ["vaultId"])
  .index("by_parent", ["vaultId", "parentId"]),
```

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"folders">` | Auto-generated primary key |
| `name` | `string` | Folder display name |
| `parentId` | `Id<"folders">` or `undefined` | Parent folder (`undefined` = root level) |
| `vaultId` | `Id<"vaults">` | Owning vault |
| `order` | `number` | Sort position among siblings |

### Notes (`convex/schema.ts`)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"notes">` | Auto-generated primary key |
| `title` | `string` | Note title (display name) |
| `content` | `string` | Markdown content |
| `folderId` | `Id<"folders">` or `undefined` | Containing folder (`undefined` = root level) |
| `vaultId` | `Id<"vaults">` | Owning vault |
| `order` | `number` | Sort position among sibling notes (computed independently from folder order) |
| `createdAt` | `number` | Creation timestamp |
| `updatedAt` | `number` | Last modification timestamp |

**Indexes:** `by_vault` (`["vaultId"]`), `by_folder` (`["vaultId", "folderId"]`), plus `search_content` and `search_title` search indexes.

> **Note:** Folders use `name` for their display field while notes use `title`. The `folders.rename` mutation takes `{ id, name }` while `notes.rename` takes `{ id, title }`.

## Folder API

### Queries

#### `folders.list(vaultId)`

Returns all folders in a vault. The frontend builds the tree structure client-side using `parentId` relationships.

### Mutations

#### `folders.create({ name, vaultId, parentId? })`

Creates a new folder. If `parentId` is provided, the folder is nested inside another folder; otherwise, it is placed at the root level. The `order` field is set to the count of existing sibling folders. Returns the new folder's `Id<"folders">`. Requires authentication and vault ownership verification.

#### `folders.rename(id, name)`

Renames a folder.

#### `folders.move({ id, parentId? })`

Moves a folder to a new parent. Setting `parentId` to `undefined` moves the folder to the root level. Note: the `order` field is **not** recomputed after moving.

#### `folders.remove({ id })`

Deletes a folder. Child notes and folders within the deleted folder are **promoted** to the deleted folder's parent (i.e., they are moved up one level, not deleted). Note: the `order` field is **not** recomputed for promoted children.

## Notes API

### Queries

#### `notes.list({ vaultId })`

Returns all notes in a vault.

### Mutations

#### `notes.create({ title, vaultId, folderId? })`

Creates a new note with empty content. Returns the new note's `Id<"notes">`. The `order` field is set to the count of existing sibling notes.

#### `notes.rename({ id, title })`

Renames a note and propagates wiki link reference updates server-side across all notes in the vault. Updates `[[OldTitle]]`, `[[OldTitle|`, and `[[OldTitle#` patterns.

#### `notes.move({ id, folderId? })`

Moves a note to a folder. Note: the `order` field is **not** recomputed after moving.

#### `notes.remove({ id })`

Deletes a note.

## Frontend Component

**File:** `src/components/explorer/FileExplorer.tsx`

### Tree Building

The component receives flat lists of folders and notes from Convex queries, then builds a recursive tree structure:

1. **Root items**: Folders with no `parentId` and notes with no `folderId`.
2. **Nesting**: Each folder's children are discovered by filtering for items whose `parentId`/`folderId` matches the folder's `_id`.
3. **Sorting**: Items are sorted by `order` field, with folders appearing before notes at each level.

### UI Structure

```
File Explorer Panel
├── Header: "Explorer" label + action buttons
│   ├── [+] Create Note (at root)
│   └── [📁+] Create Folder (at root)
├── Tree View (scrollable)
│   ├── 📁 Folder A (clickable to expand/collapse)
│   │   ├── 📄 Note 1 (clickable to open)
│   │   ├── 📄 Note 2
│   │   └── 📁 Subfolder
│   │       └── 📄 Note 3
│   ├── 📄 Root Note 1
│   └── 📄 Root Note 2
└── (Empty state message if no items)
```

### Interactions

| Action | Trigger | Behavior |
|--------|---------|----------|
| **Expand / Collapse Folder** | Click folder row | Toggles `expanded` set; shows/hides children |
| **Open Note** | Click note row | Dispatches `OPEN_NOTE` to workspace context |
| **Create Note** | Click `+` (Plus) button on header or folder hover | Opens inline creation form with default name "Untitled". On Enter or blur, calls `notes.create`, then auto-opens the new note via `OPEN_NOTE`. If inside a folder, auto-expands it. |
| **Create Folder** | Click `FolderPlus` button on header or folder hover | Opens inline creation form with default name "New Folder". On Enter or blur, calls `folders.create`. If inside a folder, auto-expands it. |
| **Rename** | Double-click item name | Switches to inline edit mode; save on Enter or blur. Escape cancels. |
| **Delete Note** | Click `Trash2` icon (visible on hover) | Calls `notes.remove` mutation |
| **Delete Folder** | Click `Trash2` icon (visible on hover) | Calls `folders.remove` mutation; children promoted |
| **Move (Drag & Drop)** | Drag item onto a folder or root area | Calls `notes.move({ id, folderId })` or `folders.move({ id, parentId })`. Dropping on empty space moves to root. |

### Inline Editing

When renaming a folder or note:

1. An `<input>` replaces the name text.
2. The input is auto-focused and pre-filled with the current name.
3. Pressing **Enter** or clicking outside saves the new name.
4. Pressing **Escape** cancels the edit.
5. For notes, renaming also triggers wiki link reference updates (see [wiki-links-and-backlinks.md](./wiki-links-and-backlinks.md)).

### State

- **`expanded`**: A `Set<string>` tracking which folder IDs are currently expanded. Managed with local `useState`.
- **`editingId`** and **`editingName`**: Track which item is being renamed inline.
- **`creatingIn`**: `{ parentId: Id<"folders"> | undefined; type: "folder" | "note" } | null` — tracks both the parent folder and type when creating a new item via the inline form.
- **`newItemName`**: The text being typed in the inline creation input.
- **`dragOverId`**: `string | null` — tracks which folder (or `"root"`) is currently being dragged over, used for visual drop-target highlighting.

### Drag & Drop

- Items can be dragged and dropped onto folders or the root area to reorganize the tree.
- Drop targets are visually indicated with a `bg-obsidian-bg-tertiary` highlight (tracked via `dragOverId` state).
- Dropping a note onto a folder calls `notes.move({ id, folderId })`.
- Dropping a folder onto another folder calls `folders.move({ id, parentId })`.
- Dropping on the root area (empty space outside folders) moves the item to the root level by passing `undefined` as the parent/folder.

### Visual Design

- Indentation per nesting level (left padding increases with depth).
- Folder icons: `ChevronRight` (collapsed) / `ChevronDown` (expanded) + `Folder` / `FolderOpen`.
- Note icons: `FileText` from lucide-react.
- Hover state reveals action buttons: `Plus` + `FolderPlus` + `Trash2` for folders, `Trash2` only for notes. Rename is triggered by double-click, not a hover button.
- Active/selected note is highlighted with `bg-obsidian-bg-tertiary`.
- Text truncation with ellipsis for long names.
