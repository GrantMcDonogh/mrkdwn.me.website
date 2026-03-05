# Audit Log, Version History & Trash

## Overview

mrkdwn.me tracks all user actions, maintains point-in-time snapshots of note content, and uses soft deletion with a Trash UI for safe, recoverable deletes.

- **Audit Log** — records every action (create, edit, rename, move, delete, restore, permanent delete) with user attribution
- **Note Version Snapshots** — automatic content snapshots, throttled to max 1 per 5 minutes on edits, always created on rename/move/delete
- **Soft Delete & Trash** — deleted notes and folders are retained for up to 5 years, browsable and restorable from the Trash panel

## Data Model

### `auditLog` table (`convex/schema.ts`)

```typescript
auditLog: defineTable({
  vaultId: v.id("vaults"),
  userId: v.string(),
  action: v.union(
    v.literal("create"), v.literal("update"), v.literal("rename"),
    v.literal("move"), v.literal("delete"), v.literal("restore"),
    v.literal("permanent_delete")
  ),
  targetType: v.union(v.literal("note"), v.literal("folder")),
  targetId: v.string(),
  targetName: v.string(),
  metadata: v.optional(v.any()),
  timestamp: v.number(),
})
  .index("by_vault", ["vaultId", "timestamp"])
  .index("by_target", ["targetId", "timestamp"])
```

| Field | Type | Description |
|-------|------|-------------|
| `vaultId` | `Id<"vaults">` | The vault where the action occurred |
| `userId` | `string` | Clerk `tokenIdentifier` of the actor |
| `action` | union | One of: `create`, `update`, `rename`, `move`, `delete`, `restore`, `permanent_delete` |
| `targetType` | `"note" \| "folder"` | Type of the affected entity |
| `targetId` | `string` | Stringified ID of the target (survives hard deletion) |
| `targetName` | `string` | Note title or folder name at time of action |
| `metadata` | `any` (optional) | Action-specific data (e.g. `{ oldTitle, newTitle }` for rename) |
| `timestamp` | `number` | Unix timestamp of the action |

### `noteVersions` table (`convex/schema.ts`)

```typescript
noteVersions: defineTable({
  noteId: v.id("notes"),
  vaultId: v.id("vaults"),
  title: v.string(),
  content: v.string(),
  savedBy: v.string(),
  savedAt: v.number(),
  trigger: v.union(
    v.literal("auto"), v.literal("rename"),
    v.literal("move"), v.literal("delete")
  ),
})
  .index("by_note", ["noteId", "savedAt"])
  .index("by_vault", ["vaultId", "savedAt"])
```

| Field | Type | Description |
|-------|------|-------------|
| `noteId` | `Id<"notes">` | The note this snapshot belongs to |
| `vaultId` | `Id<"vaults">` | The vault (for cascade deletion) |
| `title` | `string` | Note title at snapshot time |
| `content` | `string` | Note content at snapshot time |
| `savedBy` | `string` | Clerk `tokenIdentifier` of the user who triggered the snapshot |
| `savedAt` | `number` | Unix timestamp of the snapshot |
| `trigger` | union | What caused the snapshot: `auto` (content edit), `rename`, `move`, or `delete` |

### Soft-delete fields on `notes` and `folders`

Both the `notes` and `folders` tables have these optional fields added:

| Field | Type | Description |
|-------|------|-------------|
| `isDeleted` | `v.optional(v.boolean())` | `true` when soft-deleted; `undefined` means active |
| `deletedAt` | `v.optional(v.number())` | Timestamp of deletion |
| `deletedBy` | `v.optional(v.string())` | `tokenIdentifier` of the user who deleted it |

The `notes` table also has:

| Field | Type | Description |
|-------|------|-------------|
| `updatedBy` | `v.optional(v.string())` | `tokenIdentifier` of the user who last edited the note |

Fields are optional so existing documents require no migration — `undefined` is treated as "not deleted".

---

## Audit Log

### Backend (`convex/auditLog.ts`)

#### Helper

```typescript
logAudit(db, { vaultId, userId, action, targetType, targetId, targetName, metadata? })
```

Called by every mutation that modifies notes or folders. Not exported as a Convex function — it's a shared helper imported directly by other modules.

#### Queries

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `auditLog.listByVault` | `{ vaultId, limit? }` | `AuditEntry[]` | All entries for a vault, newest first. Default limit 100. |
| `auditLog.listByTarget` | `{ targetId }` | `AuditEntry[]` | All actions on a specific note or folder, newest first. |

Both queries require authentication and vault access (viewer+).

### Frontend (`src/components/vault/AuditLog.tsx`)

A modal dialog accessible from the toolbar (ClipboardList icon). Displays a filterable list of all actions in the current vault.

| Feature | Description |
|---------|-------------|
| Action filter | Dropdown to filter by action type |
| Target filter | Dropdown to filter by target type (note/folder) |
| Color-coded icons | Each action type has a distinct icon and color |
| Metadata display | Renames show old → new name; moves show folder changes |
| Timestamps | Relative time display (e.g. "2 hours ago") |

---

## Version History

### Backend (`convex/noteVersions.ts`)

#### Snapshot Creation

```typescript
maybeCreateSnapshot(db, { noteId, vaultId, userId, trigger })
```

- **`auto` trigger**: Throttled — at most one snapshot per 5 minutes per note. Checks the most recent snapshot's `savedAt` timestamp.
- **`rename`, `move`, `delete` triggers**: Always create a snapshot, regardless of throttle.
- Snapshots capture the note's state **before** the change (pre-edit content and title).

#### Queries & Mutations

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `noteVersions.listByNote` | Query | `{ noteId }` | `Version[]` | All versions for a note, newest first |
| `noteVersions.get` | Query | `{ id }` | `Version` | Get a specific version |
| `noteVersions.restoreVersion` | Mutation | `{ noteId, versionId }` | — | Copies version content/title back to the note |

All require authentication. `restoreVersion` requires editor+ access.

#### When Snapshots Are Created

| Mutation | Trigger | Throttled? |
|----------|---------|------------|
| `notes.update` | `auto` | Yes (5 min) |
| `notes.rename` | `rename` | No |
| `notes.move` | `move` | No |
| `notes.remove` | `delete` | No |

### Frontend (`src/components/editor/VersionHistory.tsx`)

Displayed in the right panel (triggered by the History toolbar button or `SET_RIGHT_PANEL("history")`).

| Feature | Description |
|---------|-------------|
| Version list | Shows all snapshots for the active note with trigger type, timestamp, and user |
| Preview | Click a version to see its content in a read-only preview |
| Restore | "Restore this version" button copies the snapshot back to the note (editor+ only) |

---

## Soft Delete & Trash

### Soft Delete Behavior

#### Notes (`convex/notes.ts`)

`notes.remove` no longer calls `ctx.db.delete()`. Instead, it:
1. Creates a version snapshot (trigger: `delete`)
2. Patches the note with `isDeleted: true`, `deletedAt`, `deletedBy`
3. Logs an audit entry

#### Folders (`convex/folders.ts`)

`folders.remove` performs a **cascading soft delete**:
1. Recursively collects all descendant folder IDs
2. Soft-deletes all descendant folders with the same `deletedAt` timestamp
3. Soft-deletes all notes in the folder and its descendants
4. Soft-deletes the folder itself
5. Logs an audit entry

All items in a cascade share the same `deletedAt` timestamp, enabling batch restore.

#### Filtering

All queries that list notes or folders now exclude soft-deleted items:
- `notes.list` — filters `isDeleted !== true`
- `folders.list` — filters `isDeleted !== true`
- `notes.search` — post-filters deleted results
- `notes.getBacklinks` — excludes deleted notes
- `notes.getUnlinkedMentions` — excludes deleted notes
- `notes.rename` — skips wiki link propagation to deleted notes
- Internal API mirrors the same filtering and audit logging

### Trash Backend (`convex/trash.ts`)

#### Queries

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `trash.listDeleted` | `{ vaultId }` | `TrashItem[]` | All soft-deleted notes and folders, sorted by `deletedAt` desc |
| `trash.getDeletedCount` | `{ vaultId }` | `number` | Count of items in trash (for sidebar badge) |

#### Mutations

| Function | Parameters | Auth | Description |
|----------|-----------|------|-------------|
| `trash.restoreNote` | `{ id }` | Editor+ | Clears soft-delete fields. If parent folder is also deleted, moves note to vault root. Logs audit (`restore`). |
| `trash.restoreFolder` | `{ id }` | Editor+ | Restores folder + all descendants + notes deleted at the same `deletedAt` timestamp. Orphaned folders moved to root. Logs audit. |
| `trash.permanentDeleteNote` | `{ id }` | Owner | Hard-deletes note and all its version snapshots. Logs audit (`permanent_delete`). |
| `trash.permanentDeleteFolder` | `{ id }` | Owner | Hard-deletes folder. Logs audit. |
| `trash.emptyTrash` | `{ vaultId }` | Owner | Hard-deletes all soft-deleted items in the vault. |

#### Internal Mutations

| Function | Description |
|----------|-------------|
| `trash.purgeExpired` | Queries notes/folders where `isDeleted === true` and `deletedAt` is older than 5 years, hard-deletes in batches of 100. Called by daily cron. |

### Cron Job (`convex/crons.ts`)

```typescript
crons.daily("purge expired trash", { hourUTC: 3, minuteUTC: 0 },
  internal.trash.purgeExpired
);
```

Runs daily at 03:00 UTC to purge items deleted more than 5 years ago.

### Trash UI (`src/components/trash/TrashPanel.tsx`)

Displayed in the sidebar, toggled by a Trash button at the bottom. When active, replaces the FileExplorer.

| Feature | Description |
|---------|-------------|
| Item list | Shows deleted notes and folders with type icons, names, and relative deletion dates |
| Restore button | Available to editors and owners — restores the item |
| Delete Forever button | Owner-only — permanently deletes the item |
| Empty Trash button | Owner-only — permanently deletes all trash items |
| Count badge | Shows the number of items in trash on the sidebar toggle button |

### Sidebar Changes (`src/components/layout/Sidebar.tsx`)

- A Trash toggle button is added at the bottom of the sidebar, between the FileExplorer and the sidebar border.
- Shows a `Trash2` icon with a count badge when items are in the trash.
- When active, the TrashPanel replaces the FileExplorer content.

### File Explorer Changes (`src/components/explorer/FileExplorer.tsx`)

- Delete confirmation dialogs have been removed — soft delete is non-destructive and recoverable from Trash.
- Notes and folders are immediately moved to trash on delete click.

---

## Cascade Deletion Updates

### `vaults.remove` (`convex/vaults.ts`)

When a vault is deleted, the cascade now also cleans up:
- All `noteVersions` for the vault (via `by_vault` index)
- All `auditLog` entries for the vault (via `by_vault` index)

These are deleted before the existing cascades for notes, folders, members, and API keys.

---


## REST API & MCP Server Coverage

All mutations in `convex/internalApi.ts` (which back the REST API v1 and MCP server) call `logAudit()` and `maybeCreateSnapshot()`, matching the behavior of the frontend mutations. The API key owner's Clerk `tokenIdentifier` is passed as the `userId` from the `auth` context provided by the `apiKeyAction` wrapper.

Each internal mutation accepts an optional `userId` parameter. When called from `apiFolders.ts` or `apiNotes.ts`, this is set to `auth.userId`. If omitted (e.g. from import flows), it defaults to `"api"`.

| Internal Mutation | Audit Action | Version Snapshot |
|-------------------|-------------|-----------------|
| `createFolder` | `create` | - |
| `renameFolder` | `rename` (with `oldName`/`newName` metadata) | - |
| `moveFolder` | `move` (with `fromParent`/`toParent` metadata) | - |
| `removeFolder` | `delete` | Yes - for each contained note (trigger: `delete`) |
| `createNote` | `create` | - |
| `updateNote` | `update` | Yes (trigger: `auto`, 5-min throttle) |
| `renameNote` | `rename` (with `oldTitle`/`newTitle` metadata) | Yes (trigger: `rename`) |
| `moveNote` | `move` (with `fromFolder`/`toFolder` metadata) | Yes (trigger: `move`) |
| `removeNote` | `delete` | Yes (trigger: `delete`) |

---

## Permission Matrix

| Action | Owner | Editor | Viewer |
|--------|-------|--------|--------|
| View audit log | Yes | Yes | Yes |
| View version history | Yes | Yes | Yes |
| Restore version | Yes | Yes | No |
| Soft delete note/folder | Yes | Yes | No |
| Restore from trash | Yes | Yes | No |
| Permanent delete | Yes | No | No |
| Empty trash | Yes | No | No |

---

## Tests

| Test File | Count | Coverage |
|-----------|-------|----------|
| `convex/auditLog.test.ts` | 14 | Queries, auth, access control, all action types |
| `convex/noteVersions.test.ts` | 10 | Auto snapshot, throttle, forced snapshots, restore |
| `convex/notes.test.ts` | 9 | Soft delete filtering, updatedBy, import batch audit, wiki link skip |
| `convex/folders.test.ts` | 7 | Cascading soft delete, sibling isolation, same timestamp |
| `convex/trash.test.ts` | 23 | List/count, restore, permanent delete, owner-only, empty, purge |
| `src/store/workspace.test.ts` | +3 | History panel toggle, switching, toggle off |

---

## File Summary

### Created

| File | Purpose |
|------|---------|
| `convex/auditLog.ts` | Audit log helper + queries |
| `convex/noteVersions.ts` | Version snapshot helper + queries + restore |
| `convex/trash.ts` | Trash queries, restore, permanent delete, purge |
| `convex/crons.ts` | Daily cron for 5-year purge |
| `src/components/trash/TrashPanel.tsx` | Trash UI in sidebar |
| `src/components/editor/VersionHistory.tsx` | Version history right panel |
| `src/components/vault/AuditLog.tsx` | Vault audit log modal |

### Modified

| File | Changes |
|------|---------|
| `convex/schema.ts` | Added `auditLog`, `noteVersions` tables; soft-delete fields on `notes` and `folders` |
| `convex/notes.ts` | Soft delete, audit logging, version snapshots, filtered queries |
| `convex/folders.ts` | Cascading soft delete, audit logging, filtered queries |
| `convex/internalApi.ts` | Mirrored soft-delete, filtering, audit logging, and version snapshots |
| `convex/apiFolders.ts` | Passes `userId` from API key auth to internal mutations |
| `convex/apiNotes.ts` | Passes `userId` from API key auth to internal mutations |
| `convex/vaults.ts` | Cascade to `noteVersions` and `auditLog` on vault delete |
| `src/store/workspace.tsx` | Added `"history"` to `rightPanel` union |
| `src/hooks/useVaultRole.ts` | Added `canPermanentDelete` flag |
| `src/components/explorer/FileExplorer.tsx` | Removed delete confirmation dialogs |
| `src/components/layout/Sidebar.tsx` | Added Trash toggle button with count badge |
| `src/components/layout/AppLayout.tsx` | Added History and Audit Log toolbar buttons |
