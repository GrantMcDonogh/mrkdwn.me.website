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
  isDeleted: v.optional(v.boolean()),
  deletedAt: v.optional(v.number()),
  deletedBy: v.optional(v.string()),
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
| `isDeleted` | `boolean` or `undefined` | Soft-delete flag (`true` = in trash) |
| `deletedAt` | `number` or `undefined` | Deletion timestamp |
| `deletedBy` | `string` or `undefined` | Who deleted it |

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
| `updatedBy` | `string` or `undefined` | Who last edited |
| `isDeleted` | `boolean` or `undefined` | Soft-delete flag (`true` = in trash) |
| `deletedAt` | `number` or `undefined` | Deletion timestamp |
| `deletedBy` | `string` or `undefined` | Who deleted it |

**Indexes:** `by_vault` (`["vaultId"]`), `by_folder` (`["vaultId", "folderId"]`), plus `search_content` and `search_title` search indexes.

> **Note:** Folders use `name` for their display field while notes use `title`. The `folders.rename` mutation takes `{ id, name }` while `notes.rename` takes `{ id, title }`.

## Folder API

### Queries

#### `folders.list(vaultId)`

Returns all **active** (non-deleted) folders in a vault. Soft-deleted folders are filtered out. The frontend builds the tree structure client-side using `parentId` relationships.

### Mutations

#### `folders.create({ name, vaultId, parentId? })`

Creates a new folder. If `parentId` is provided, the folder is nested inside another folder; otherwise, it is placed at the root level. The `order` field is set to the count of existing sibling folders. Returns the new folder's `Id<"folders">`. Requires authentication and vault ownership verification.

#### `folders.rename(id, name)`

Renames a folder.

#### `folders.move({ id, parentId? })`

Moves a folder to a new parent. Setting `parentId` to `undefined` moves the folder to the root level. Note: the `order` field is **not** recomputed after moving.

#### `folders.remove({ id })`

Soft-deletes a folder and all of its contents via **cascading soft delete**. All descendant folders and contained notes are marked as `isDeleted: true` with the same `deletedAt` timestamp. Items can be restored from the Trash panel. See [Audit Log, Version History & Trash](./audit-log-version-history-trash.md).

## Notes API

### Queries

#### `notes.list({ vaultId })`

Returns all **active** (non-deleted) notes in a vault. Soft-deleted notes are filtered out.

### Mutations

#### `notes.create({ title, vaultId, folderId? })`

Creates a new note with empty content. Returns the new note's `Id<"notes">`. The `order` field is set to the count of existing sibling notes.

#### `notes.rename({ id, title })`

Renames a note and propagates wiki link reference updates server-side across all notes in the vault. Updates `[[OldTitle]]`, `[[OldTitle|`, and `[[OldTitle#` patterns.

#### `notes.move({ id, folderId? })`

Moves a note to a folder. Note: the `order` field is **not** recomputed after moving.

#### `notes.remove({ id })`

Soft-deletes a note by setting `isDeleted: true`, `deletedAt`, and `deletedBy`. Creates a version snapshot before deletion. The note can be restored from the Trash panel. See [Audit Log, Version History & Trash](./audit-log-version-history-trash.md).

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
├── Hidden <input type="file" multiple accept=".md">
├── Header: "Explorer" label (or "Uploading…" spinner) + action buttons
│   ├── [+] Create Note (at root)
│   ├── [📁+] Create Folder (at root)
│   └── [⬆] Upload .md Files (at root)
├── Tree View (scrollable, drop zone for external files)
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
| **Upload .md Files** | Click `Upload` button on header or folder hover | Opens native file picker (`.md` only, multi-select). Filters to `.md` files, reads content, batches via `batchNotes()`, and calls `notes.importBatch` for each batch. Header shows "Uploading…" spinner during upload. When triggered from a folder's hover button, notes are created inside that folder; from the header, notes go to the vault root. |
| **Rename** | Double-click item name | Switches to inline edit mode; save on Enter or blur. Escape cancels. |
| **Delete Note** | Click `Trash2` icon (visible on hover) | Calls `notes.remove` mutation (soft delete — moves to trash) |
| **Delete Folder** | Click `Trash2` icon (visible on hover) | Calls `folders.remove` mutation (cascading soft delete — folder + descendants moved to trash) |
| **Move (Drag & Drop)** | Drag item onto a folder or root area | Calls `notes.move({ id, folderId })` or `folders.move({ id, parentId })`. Dropping on empty space moves to root. Folders cannot be dropped into themselves or their own descendants — such drops are redirected to root. No-op moves (already at target) are skipped. |
| **Upload via Drag & Drop** | Drag `.md` files from OS file manager onto the explorer | Detects external file drops (checks `e.dataTransfer.files`), filters to `.md` files, and uploads them via `prepareUploadNotes()` + `batchNotes()` + `notes.importBatch`. Dropping onto a folder uploads into that folder; dropping on the root area uploads to the vault root. Non-`.md` files are silently ignored. |

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
- **`uploading`**: `boolean` — true while `.md` files are being uploaded; toggles the header between "Explorer" label and "Uploading…" spinner.
- **`fileInputRef`**: `React.RefObject<HTMLInputElement>` — ref to the hidden file input, triggered programmatically by the upload buttons.
- **`uploadTargetRef`**: `React.MutableRefObject<Id<"folders"> | undefined>` — stores the target folder for the current upload (set before opening the file picker).

### Drag & Drop

The `handleDrop` function handles two types of drops:

**External file drops (from OS file manager):**
- Detected by checking `e.dataTransfer.files.length > 0` first.
- If any dropped files have a `.md` extension, `handleUploadFiles()` is called with the files and the target folder ID.
- Files are processed via `prepareUploadNotes()` (filters to `.md`, reads content, derives titles), batched via `batchNotes()`, and uploaded via `notes.importBatch`.
- Non-`.md` files in the drop are silently ignored.

**Internal drag-and-drop (reordering notes/folders):**
- Falls through to the existing logic if no external files are detected.
- Items can be dragged and dropped onto folders or the root area to reorganize the tree.
- Drop targets are visually indicated with a `bg-obsidian-bg-tertiary` highlight (tracked via `dragOverId` state).
- Dropping a note onto a folder calls `notes.move({ id, folderId })`.
- Dropping a folder onto another folder calls `folders.move({ id, parentId })`.
- Dropping on the root area (empty space outside folders) moves the item to the root level by passing `undefined` as the parent/folder.
- **Cycle prevention:** Before moving a folder, the code walks up the parent chain from the drop target. If the dragged folder is found as an ancestor, the move is redirected to root (`undefined`) to prevent self-referencing or circular parent chains that would orphan the folder from the tree.
- **No-op detection:** If a folder is already at the target location (same `parentId`), the drop is silently ignored.

### Visual Design

- Indentation per nesting level (left padding increases with depth).
- Folder icons: `ChevronRight` (collapsed) / `ChevronDown` (expanded) + `Folder` / `FolderOpen`.
- Note icons: `FileText` from lucide-react.
- Hover state reveals action buttons: `Plus` + `FolderPlus` + `Upload` + `Trash2` for folders, `Trash2` only for notes. Rename is triggered by double-click, not a hover button.
- Active/selected note is highlighted with `bg-obsidian-bg-tertiary`.
- Text truncation with ellipsis for long names.
