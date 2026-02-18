# Vault System

## Overview

Vaults are the top-level organizational unit in mrkdwn.me, mirroring the concept of vaults in the desktop Obsidian application. Each vault is an isolated workspace containing its own set of folders and notes. A user can create multiple vaults to separate different knowledge bases (e.g., "Work", "Personal", "Research").

## Data Model

### Schema (`convex/schema.ts`)

```typescript
vaults: defineTable({
  name: v.string(),
  userId: v.string(),
  createdAt: v.number(),
  settings: v.optional(v.any()),
}).index("by_user", ["userId"]),
```

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"vaults">` | Auto-generated primary key |
| `name` | `string` | Display name of the vault |
| `userId` | `string` | Clerk `tokenIdentifier` identifying the owning user |
| `createdAt` | `number` | Unix timestamp of creation |
| `settings` | `any` (optional) | Imported Obsidian settings (editor, appearance, graph). See [Import Vault](./import-vault.md) for shape details. |

### Index

- **`by_user`** (`[userId]`) — Enables efficient lookup of all vaults belonging to a user.

## API

### Queries

#### `vaults.list`

Lists all vaults owned by the authenticated user.

- **Auth**: Required
- **Parameters**: None
- **Returns**: Array of vault documents, queried via the `by_user` index
- **Usage**: Called by `VaultSelector` to display the vault list

#### `vaults.get`

Retrieves a single vault by ID with ownership verification.

- **Auth**: Required
- **Parameters**: `{ id: Id<"vaults"> }`
- **Returns**: Vault document
- **Throws**: If the vault does not exist or does not belong to the authenticated user

### Mutations

#### `vaults.create`

Creates a new vault for the authenticated user.

- **Auth**: Required
- **Parameters**: `{ name: string }`
- **Behavior**: Inserts a new vault with the current timestamp
- **Returns**: The new vault's `Id<"vaults">`

#### `vaults.rename`

Renames an existing vault.

- **Auth**: Required
- **Parameters**: `{ id: Id<"vaults">, name: string }`
- **Behavior**: Verifies ownership, then patches the vault name

#### `vaults.remove`

Deletes a vault and all of its contents.

- **Auth**: Required
- **Parameters**: `{ id: Id<"vaults"> }`
- **Behavior**:
  1. Verifies ownership
  2. Queries all notes in the vault → deletes each one
  3. Queries all folders in the vault → deletes each one
  4. Deletes the vault document itself
- **Cascade**: Full cascade deletion — no orphaned folders or notes remain

### Internal Mutations

#### `vaults.importCreateVault`

Creates a vault document without client-facing auth (called from the `importVault.createVaultWithFolders` action which already verified auth).

- **Type**: Internal mutation
- **Parameters**: `{ name: string, userId: string, settings?: any }`
- **Returns**: `Id<"vaults">`

## Import Vault

Users can import existing Obsidian vaults from their local filesystem. The import flow reads all `.md` files and folder structure, parses applicable `.obsidian` settings, and creates everything in the database. See [Import Vault](./import-vault.md) for full details.

## Frontend

### Vault Selector

**File:** `src/components/vault/VaultSelector.tsx`

The vault selector is the first screen shown after authentication. It displays all of the user's vaults and allows creating, renaming, deleting, and selecting vaults.

#### UI Elements

| Element | Description |
|---------|-------------|
| Header | "Your Vaults" title with a "Sign Out" button (`LogOut` icon, calls `useClerk().signOut()`) |
| Vault List | Vertical stack of vault cards, each showing the vault name with hover-reveal action buttons (Pencil for rename, Trash2 for delete) |
| Create Button | Full-width dashed-border card with `Plus` icon and "Create New Vault" text |
| Import Button | Full-width dashed-border card with `Upload` icon and "Import Vault" text. Opens the Import Vault dialog. |
| Create Form | Inline form with text input, "Create" submit button, and "Cancel" button |
| Empty State | "No vaults yet. Create one to get started." message (shown when no vaults exist) |

#### Interactions

1. **Select Vault**: Clicking a vault card dispatches `SET_VAULT` action, which transitions the UI to the main `AppLayout`.
2. **Create Vault**: Clicking "Create New Vault" reveals an input field. Submitting calls `vaults.create` mutation.
3. **Rename Vault**: Double-clicking the Pencil icon on a vault card enables inline editing. On blur or Enter, calls `vaults.rename`. Pressing Escape cancels the rename without saving.
4. **Delete Vault**: Clicking the Trash2 icon triggers a native `window.confirm()` dialog. On confirm, calls `vaults.remove`.
5. **Import Vault**: Clicking "Import Vault" opens `ImportVaultDialog`, a modal that guides the user through selecting a local Obsidian vault folder, previewing its contents, and importing all notes, folders, and settings. See [Import Vault](./import-vault.md) for the full flow.

#### State Management

- The selected vault ID is stored in the workspace context (`vaultId` field).
- Dispatching `SET_VAULT` sets the vault and resets the entire workspace state (`...initialState`), including sidebar, right panel, search query, and split direction.
- Dispatching `LEAVE_VAULT` clears the vault and resets the entire workspace state, returning to the selector.

### Vault Navigation

- From within the app layout, users can return to the vault selector via the command palette ("Switch Vault" command).
- Switching vaults clears all open tabs and panes, resetting the workspace state.

## Ownership & Access Control

- All vault operations verify that the requesting user owns the vault.
- There is no sharing mechanism — vaults are strictly single-user.
- The `by_user` index ensures only the owner's vaults are returned in queries.

## Cascade Deletion Behavior

When a vault is deleted:

```
Vault
 ├── Note 1      → deleted
 ├── Note 2      → deleted
 ├── Folder A    → deleted
 │   ├── Note 3  → deleted (via vault query, not folder cascade)
 │   └── Folder B→ deleted
 └── Note 4      → deleted
```

All notes and folders are queried by `vaultId` and deleted individually before the vault document itself is removed. This ensures no orphaned data remains.
