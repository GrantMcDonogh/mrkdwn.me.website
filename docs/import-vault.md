# Import Vault

## Overview

The Import Vault feature allows users to migrate existing Obsidian vaults into mrkdwn.me. A user selects a vault folder from their computer, and the system recursively reads all `.md` files, reconstructs the folder structure, parses applicable `.obsidian` settings, and imports everything into the Convex database.

## Data Flow

```
User selects folder
        │
        ▼
  ┌─────────────┐
  │ parseVault  │  Client-side: categorize files, build folder tree,
  │ Files()     │  read .md contents, parse .obsidian settings
  └──────┬──────┘
         │ ParsedVault
         ▼
  ┌──────────────────────┐
  │ createVaultWith      │  Convex action: creates vault document,
  │ Folders (action)     │  then batch-inserts all folders server-side
  └──────┬───────────────┘
         │ { vaultId, folderIdMap }
         ▼
  ┌──────────────────────┐
  │ notes.importBatch    │  Convex mutation: client sends notes in
  │ (mutation, N calls)  │  size-aware batches (≤800KB each)
  └──────┬───────────────┘
         │
         ▼
   Vault ready to use
```

### Why This Split?

Folders are small (just names and parent references), so the action handles them all server-side in a single round-trip. Notes carry markdown content and can be large, so the client sends them in size-aware batches directly via a public mutation to stay under Convex's 1MB argument limit.

## Schema Change

The `vaults` table has an optional `settings` field to store imported Obsidian configuration:

```typescript
vaults: defineTable({
  name: v.string(),
  userId: v.string(),
  createdAt: v.number(),
  settings: v.optional(v.any()),  // imported .obsidian settings
}).index("by_user", ["userId"]),
```

### VaultSettings Shape

The `settings` field is typed as `v.any()` in the schema but has a known client-side interface:

```typescript
interface VaultSettings {
  editor?: { readableLineLength?: boolean; spellcheck?: boolean };
  appearance?: { cssTheme?: string };
  graph?: {
    centerStrength?: number;
    repelStrength?: number;
    linkStrength?: number;
    linkDistance?: number;
  };
}
```

### .obsidian File Mapping

| .obsidian file | Fields extracted | Maps to |
|---|---|---|
| `app.json` | `readableLineLength`, `spellcheck` | `settings.editor` |
| `appearance.json` | `cssTheme` | `settings.appearance` |
| `graph.json` | `centerStrength`, `repelStrength`, `linkStrength`, `linkDistance` | `settings.graph` |
| `core-plugins.json` | — | Skipped (no plugin system) |
| `workspace.json` | — | Skipped (ephemeral state) |
| `themes/` | — | Skipped (no custom CSS system) |

Only fields with the correct type are extracted (booleans for editor, string for cssTheme, numbers for graph). Malformed JSON files are silently skipped.

---

## API

### Action

**File:** `convex/importVault.ts`

#### `importVault.createVaultWithFolders`

Orchestrates vault and folder creation server-side.

- **Type**: Action (public, with auth)
- **Parameters**: `{ name: string, settings?: any, folders: ImportedFolder[] }`
- **Behavior**:
  1. Verifies authentication
  2. Calls `vaults.importCreateVault` internal mutation to create the vault
  3. Batches folders in groups of 50, calling `folders.importBatch` for each batch
  4. Accumulates a `tempId → realId` mapping across batches
- **Returns**: `{ vaultId: Id<"vaults">, folderIdMap: Record<string, string> }`

### Internal Mutations

#### `vaults.importCreateVault`

**File:** `convex/vaults.ts`

Creates a vault document without client-facing auth (called from the action which already verified auth).

- **Type**: Internal mutation
- **Parameters**: `{ name: string, userId: string, settings?: any }`
- **Returns**: `Id<"vaults">`

#### `folders.importBatch`

**File:** `convex/folders.ts`

Batch-creates folders using a `tempId` → real ID mapping system. Folders must arrive topologically sorted (parents before children).

- **Type**: Internal mutation
- **Parameters**: `{ folders: FolderSpec[], parentIdMap: Record<string, string> }`
- **Returns**: `Record<string, string>` — new mappings from this batch

Each folder spec: `{ tempId, name, vaultId, parentTempId?, order }`

### Public Mutation

#### `notes.importBatch`

**File:** `convex/notes.ts`

Batch-creates notes with authentication. Called directly from the client in size-aware batches.

- **Type**: Mutation (public, with auth)
- **Parameters**: `{ notes: NoteSpec[] }`
- **Behavior**: Verifies auth, checks vault ownership via the first note's `vaultId`, inserts all notes with current timestamp

Each note spec: `{ title, content, vaultId, folderId?, order }`

---

## Client-Side Parsing

**File:** `src/lib/importVault.ts`

### `parseVaultFiles(files: FileList) → Promise<ParsedVault>`

Processes a `FileList` from `<input type="file" webkitdirectory>` into a structured import payload.

1. **Vault name**: Extracted from the first path segment of `webkitRelativePath` (e.g., `"AI Brain/Books/note.md"` → `"AI Brain"`)
2. **File categorization**: `.md` files → notes, `.obsidian/*` → settings, everything else → skipped
3. **Folder tree**: Unique directory paths are extracted from `.md` file paths, deduplicated, and topologically sorted (parents before children). Each folder gets a `tempId` and a `parentTempId` reference.
4. **Note reading**: Each `.md` file is read via `file.text()`. Title is the filename without `.md` extension. Notes are assigned incremental `order` values within each folder independently.
5. **Settings parsing**: `app.json`, `appearance.json`, and `graph.json` are parsed with type-safe field extraction.

### `batchNotes(notes, folderIdMap, vaultId) → batches[]`

Splits notes into batches where each batch's total JSON-serialized size stays under 800KB. Maps `folderTempId` to real `folderId` using the server-returned mapping.

### Exported Types

```typescript
interface ParsedVault {
  name: string;
  folders: ImportedFolder[];
  notes: ImportedNote[];
  settings?: VaultSettings;
  stats: { totalFiles: number; mdFiles: number; skippedFiles: number; folders: number };
}

interface ImportedFolder {
  tempId: string;
  name: string;
  parentTempId?: string;
  order: number;
}

interface ImportedNote {
  title: string;
  content: string;
  folderTempId?: string;
  order: number;
}
```

---

## Frontend

### Import Vault Dialog

**File:** `src/components/vault/ImportVaultDialog.tsx`

A modal dialog with a state machine managing the import flow.

#### States

| State | UI |
|---|---|
| `idle` | Description text + "Select Folder" button |
| `parsing` | Spinner + "Reading files..." |
| `preview` | Editable vault name, stats table (notes, folders, skipped files), "Import" + "Cancel" buttons |
| `uploading` | Spinner + progress message ("Creating vault..." → "Uploading notes (batch N of M)...") |
| `done` | Checkmark + "Import complete!" → auto-navigates to vault after 1 second |
| `error` | Error message + "Try Again" button (resets to `idle`) |

#### Import Flow

1. User clicks "Select Folder" → triggers hidden `<input webkitdirectory>` file picker
2. `onChange` → `parseVaultFiles(files)` → transitions to `preview`
3. User reviews stats, optionally edits vault name, clicks "Import"
4. Calls `createVaultWithFolders` action (creates vault + all folders server-side)
5. Loops through `notes.importBatch` calls for each batch, updating progress
6. Dispatches `SET_VAULT` to navigate into the imported vault

#### Styling

Follows the existing modal pattern from `QuickSwitcher.tsx`: fixed overlay with centered card, `bg-obsidian-bg-secondary`, `border-obsidian-border`. Uses lucide-react icons: `Upload`, `FolderOpen`, `X`, `Loader2`, `CheckCircle`, `AlertTriangle`.

### Vault Selector Integration

**File:** `src/components/vault/VaultSelector.tsx`

An "Import Vault" button is rendered below "Create New Vault" using the same dashed-border card style with an `Upload` icon. Clicking it opens the `ImportVaultDialog` as a modal overlay.

---

## TypeScript Support

**File:** `src/types/webkitdirectory.d.ts`

Augments React's `InputHTMLAttributes` to include `webkitdirectory` and `directory` props, avoiding `@ts-expect-error` annotations on the file input element.

---

## Tests

**File:** `src/lib/importVault.test.ts` (30 tests)

### Coverage

| Category | Tests | What's Covered |
|---|---|---|
| Vault name | 1 | Extraction from first path segment |
| File categorization | 2 | .md counting, skip counting, .obsidian exclusion |
| Folder tree | 5 | Root-only, single folder, nested parents, deduplication, topological sort |
| Notes | 5 | Title stripping, content reading, folderTempId, per-folder ordering, independent root/folder ordering |
| Settings parsing | 7 | appearance.json, graph.json, app.json, missing settings, malformed JSON, type validation for booleans/strings/numbers |
| AI Brain integration | 1 | Full realistic vault with all assertions (9 notes, 6 folders, nested parents, root notes, settings) |
| batchNotes | 6 | Single batch, folder ID mapping, size-based splitting, empty input, oversized single note, vaultId propagation |
| Edge cases | 3 | No .md files, empty content, deeply nested paths |

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `convex/schema.ts` | Modified | Added `settings` field to vaults table |
| `convex/vaults.ts` | Modified | Added `importCreateVault` internal mutation |
| `convex/folders.ts` | Modified | Added `importBatch` internal mutation |
| `convex/notes.ts` | Modified | Added `importBatch` public mutation |
| `convex/importVault.ts` | Created | `createVaultWithFolders` action |
| `src/lib/importVault.ts` | Created | Client-side file parsing + batching |
| `src/lib/importVault.test.ts` | Created | 30 unit tests |
| `src/components/vault/ImportVaultDialog.tsx` | Created | Import modal UI |
| `src/components/vault/VaultSelector.tsx` | Modified | Added Import Vault button |
| `src/types/webkitdirectory.d.ts` | Created | TypeScript type augmentation |
