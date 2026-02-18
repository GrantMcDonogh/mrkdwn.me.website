# Database & API

## Overview

mrkdwn.me uses [Convex](https://convex.dev) as its backend platform, providing a serverless document database, server-side functions (queries and mutations), real-time subscriptions, and authentication. The database schema is defined in `convex/schema.ts`, and all API functions are defined in the `convex/` directory.

## Database Schema

**File:** `convex/schema.ts`

### Entity Relationship Diagram

```
┌──────────────┐
│    vaults    │
│──────────────│
│ _id          │
│ name         │
│ userId ──────┼──→ Clerk tokenIdentifier (string)
│ createdAt    │
│ settings?    │
│ idx: by_user │
└──────┬───────┘
       │ 1
       │
   ┌───┴────────────────┐
   │ *                  │ *
┌──▼───────────┐  ┌─────▼────────┐
│   folders    │  │    notes     │
│──────────────│  │──────────────│
│ _id          │  │ _id          │
│ name         │  │ title        │
│ parentId ────┼──┐ content      │
│ vaultId ─────┼──┼→ folderId ───┼──→ folders._id (optional)
│ order        │  │ vaultId ─────┼──→ vaults._id
│ idx: by_vault│  │ order        │
│ idx: by_parent│ │ createdAt    │
└──────────────┘  │ updatedAt    │
       ▲          │ idx: by_vault│
       │          │ idx: by_folder│
       └──────────┤ search: content│
    (self-ref     │ search: title │
     parentId)    └──────────────┘
```

### Tables

> **Note:** There is no `users` table in the Convex schema. User identity is managed by Clerk; the `userId` field on vaults stores the Clerk `tokenIdentifier` string.

#### `vaults`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"vaults">` | Primary key (auto-generated) |
| `name` | `v.string()` | Vault display name |
| `userId` | `v.string()` | Clerk `tokenIdentifier` identifying the owning user |
| `createdAt` | `v.number()` | Creation timestamp (ms since epoch) |
| `settings` | `v.optional(v.any())` | Imported Obsidian settings (editor, appearance, graph). See [Import Vault](./import-vault.md). |

**Indexes:**
- `by_user` → `["userId"]` — Lookup vaults by owner

#### `folders`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"folders">` | Primary key |
| `name` | `v.string()` | Folder name |
| `parentId` | `v.optional(v.id("folders"))` | Parent folder (undefined = root) |
| `vaultId` | `v.id("vaults")` | Foreign key to vault |
| `order` | `v.number()` | Sort order among siblings |

**Indexes:**
- `by_vault` → `["vaultId"]` — All folders in a vault
- `by_parent` → `["vaultId", "parentId"]` — Folders within a specific parent

#### `notes`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"notes">` | Primary key |
| `title` | `v.string()` | Note title |
| `content` | `v.string()` | Markdown content |
| `folderId` | `v.optional(v.id("folders"))` | Containing folder (undefined = root) |
| `vaultId` | `v.id("vaults")` | Foreign key to vault |
| `order` | `v.number()` | Sort order among siblings |
| `createdAt` | `v.number()` | Creation timestamp |
| `updatedAt` | `v.number()` | Last modification timestamp |

**Indexes:**
- `by_vault` → `["vaultId"]` — All notes in a vault
- `by_folder` → `["vaultId", "folderId"]` — Notes within a specific folder

**Search Indexes:**
- `search_content` → `{ searchField: "content", filterFields: ["vaultId"] }` — Full-text search on note content, scoped by vault
- `search_title` → `{ searchField: "title", filterFields: ["vaultId"] }` — Full-text search on note title, scoped by vault

---

## API Reference

### Vault Operations

**File:** `convex/vaults.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `vaults.list` | Query | — | `Vault[]` | List user's vaults |
| `vaults.get` | Query | `{ id }` | `Vault` | Get vault (with ownership check) |
| `vaults.create` | Mutation | `{ name }` | `Id<"vaults">` | Create vault |
| `vaults.rename` | Mutation | `{ id, name }` | — | Rename vault |
| `vaults.remove` | Mutation | `{ id }` | — | Delete vault + all contents |
| `vaults.importCreateVault` | Internal Mutation | `{ name, userId, settings? }` | `Id<"vaults">` | Create vault (called from import action) |

### Folder Operations

**File:** `convex/folders.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `folders.list` | Query | `{ vaultId }` | `Folder[]` | List vault's folders |
| `folders.create` | Mutation | `{ name, vaultId, parentId? }` | `Id<"folders">` | Create folder |
| `folders.rename` | Mutation | `{ id, name }` | — | Rename folder |
| `folders.move` | Mutation | `{ id, parentId? }` | — | Move folder to new parent |
| `folders.remove` | Mutation | `{ id }` | — | Delete folder (children promoted) |
| `folders.importBatch` | Internal Mutation | `{ folders, parentIdMap }` | `Record<string, string>` | Batch-create folders with tempId mapping (called from import action) |

### Note Operations

**File:** `convex/notes.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `notes.list` | Query | `{ vaultId }` | `Note[]` | List vault's notes |
| `notes.get` | Query | `{ id }` | `Note` | Get single note |
| `notes.create` | Mutation | `{ title, vaultId, folderId? }` | `Id<"notes">` | Create note |
| `notes.update` | Mutation | `{ id, content }` | — | Update note content |
| `notes.rename` | Mutation | `{ id, title }` | — | Rename note + update wiki link references |
| `notes.move` | Mutation | `{ id, folderId? }` | — | Move note to folder |
| `notes.remove` | Mutation | `{ id }` | — | Delete note |
| `notes.search` | Query | `{ vaultId, query }` | `Note[]` | Full-text search via dual-index (title + content), merged, deduped, max 20 results |
| `notes.getBacklinks` | Query | `{ noteId }` | `{ noteId, noteTitle, context }[]` | Get notes linking to this note |
| `notes.getUnlinkedMentions` | Query | `{ noteId }` | `{ noteId, noteTitle, context }[]` | Get unlinked title mentions |
| `notes.importBatch` | Mutation | `{ notes }` | — | Batch-create notes (called from client during vault import) |

### Import Operations

**File:** `convex/importVault.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `importVault.createVaultWithFolders` | Action | `{ name, settings?, folders }` | `{ vaultId, folderIdMap }` | Orchestrates vault + folder creation server-side. See [Import Vault](./import-vault.md). |

### Chat Operations

**File:** `convex/chat.ts` (httpAction), `convex/chatHelpers.ts` (internalQuery)

| Function | Type | Description |
|----------|------|-------------|
| `chat` | httpAction | Streaming AI chat endpoint. Authenticates via `ctx.auth.getUserIdentity()`, builds context from vault notes via `chatHelpers.buildContext`, calls Claude API (`claude-sonnet-4-5-20250929`) with streaming, returns `text/plain; charset=utf-8`. |
| `chatHelpers.buildContext` | internalQuery | Accepts `{ vaultId, query }`. Searches notes via `search_title` and `search_content` indexes (15 each), merges/deduplicates. Builds two-tier context: top 5 with full content, next 10 title-only, 80K char limit. Falls back to fetching 15 notes by vault index if no search results. |

### HTTP Routes

**File:** `convex/http.ts`

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `/api/chat` | POST | `chat` | AI chat streaming endpoint |
| `/api/chat` | OPTIONS | `chat` | CORS preflight handling |

---

## Authorization Pattern

Every query and mutation follows the same authorization pattern:

```typescript
export const someFunction = query({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.tokenIdentifier;

    // For vault operations: verify vault ownership
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    // ... proceed with operation
  },
});
```

- **Authentication**: Every function calls `ctx.auth.getUserIdentity()` to verify the Clerk JWT.
- **Authorization**: Vault operations verify that the requesting user's `tokenIdentifier` matches the vault's `userId`.
- **Data isolation**: Queries are scoped by `userId` (vaults) or `vaultId` (folders/notes).

---

## Query Patterns

### Indexed Queries

```typescript
// Efficient: uses by_user index
ctx.db.query("vaults").withIndex("by_user", q => q.eq("userId", userId)).collect();

// Efficient: uses by_vault index
ctx.db.query("notes").withIndex("by_vault", q => q.eq("vaultId", vaultId)).collect();

// Efficient: uses by_parent index
ctx.db.query("folders").withIndex("by_parent", q =>
  q.eq("vaultId", vaultId).eq("parentId", parentId)
).collect();
```

### Search Queries

```typescript
// Full-text search on content
ctx.db.query("notes")
  .withSearchIndex("search_content", q =>
    q.search("content", query).eq("vaultId", vaultId)
  )
  .take(20);

// Full-text search on title
ctx.db.query("notes")
  .withSearchIndex("search_title", q =>
    q.search("title", query).eq("vaultId", vaultId)
  )
  .take(20);
```

---

## Real-Time Subscriptions

Convex queries are automatically reactive. When the underlying data changes:

1. The Convex backend detects which queries are affected.
2. Updated results are pushed to subscribed clients over a persistent connection.
3. React components using `useQuery()` re-render with new data.

This means:
- The file explorer updates instantly when a note/folder is created or deleted.
- The graph view recomputes when links change.
- The backlinks panel refreshes when references are added or removed.
- Search results update as notes are modified.

No manual polling or refresh logic is needed.

---

## Mutation Side Effects

### `notes.rename` — Wiki Link Propagation

When a note is renamed, the mutation scans all notes in the vault and updates wiki link references:

```
For each note in vault:
  Replace [[oldTitle]] → [[newTitle]]
  Replace [[oldTitle| → [[newTitle|
  Replace [[oldTitle# → [[newTitle#
```

### `vaults.remove` — Cascade Deletion

```
Delete all notes where vaultId = vault._id
Delete all folders where vaultId = vault._id
Delete the vault document
```

### `folders.remove` — Child Promotion

```
Move child folders: set parentId = deletedFolder.parentId
Move child notes: set folderId = deletedFolder.parentId (mapped to folderId)
Delete the folder document
```
