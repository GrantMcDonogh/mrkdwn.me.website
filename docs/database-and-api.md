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
│ userId ──────┼──→ Clerk tokenIdentifier (string, owner)
│ createdAt    │
│ settings?    │
│ idx: by_user │
└──────┬───────┘
       │ 1
       │
   ┌───┴───────────────────┬──────────────────┐
   │ *                     │ *                 │ *
┌──▼───────────┐  ┌────────▼──────┐  ┌────────▼──────────┐
│   folders    │  │    notes      │  │  vaultMembers     │
│──────────────│  │───────────────│  │───────────────────│
│ _id          │  │ _id           │  │ _id               │
│ name         │  │ title         │  │ vaultId ──────────┼→ vaults._id
│ parentId ────┼──┐ content       │  │ userId            │
│ vaultId ─────┼──┼→ folderId ────┼→ │ email             │
│ order        │  │ vaultId ──────┼→ │ role (editor|viewer)│
│ idx: by_vault│  │ order         │  │ invitedBy         │
│ idx: by_parent│ │ createdAt     │  │ invitedAt         │
└──────────────┘  │ updatedAt     │  │ status            │
       ▲          │ idx: by_vault │  │ acceptedAt?       │
       │          │ idx: by_folder│  │ idx: by_vault     │
       └──────────┤ search: content│ │ idx: by_user      │
    (self-ref     │ search: title │  │ idx: by_vault_user│
     parentId)    └───────────────┘  │ idx: by_email_status│
                                     └───────────────────┘

┌────────────────┐
│ userSettings   │
│────────────────│
│ _id            │
│ userId ────────┼──→ Clerk tokenIdentifier (string)
│ openRouterKey? │
│ idx: by_user   │
└────────────────┘

┌────────────────┐
│   apiKeys      │
│────────────────│
│ _id            │
│ keyHash ───────┼──→ SHA-256 hash of raw key
│ keyPrefix      │    (first 10 chars for display)
│ vaultId ───────┼──→ vaults._id
│ userId ────────┼──→ Clerk tokenIdentifier (string)
│ name           │
│ createdAt      │
│ lastUsedAt?    │
│ idx: by_hash   │
│ idx: by_vault  │
└────────────────┘
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
| `isDeleted` | `v.optional(v.boolean())` | Soft-delete flag (`true` = deleted, `undefined` = active) |
| `deletedAt` | `v.optional(v.number())` | Deletion timestamp |
| `deletedBy` | `v.optional(v.string())` | `tokenIdentifier` of the user who deleted it |

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
| `updatedBy` | `v.optional(v.string())` | `tokenIdentifier` of user who last edited |
| `isDeleted` | `v.optional(v.boolean())` | Soft-delete flag (`true` = deleted, `undefined` = active) |
| `deletedAt` | `v.optional(v.number())` | Deletion timestamp |
| `deletedBy` | `v.optional(v.string())` | `tokenIdentifier` of the user who deleted it |

**Indexes:**
- `by_vault` → `["vaultId"]` — All notes in a vault
- `by_folder` → `["vaultId", "folderId"]` — Notes within a specific folder

**Search Indexes:**
- `search_content` → `{ searchField: "content", filterFields: ["vaultId"] }` — Full-text search on note content, scoped by vault
- `search_title` → `{ searchField: "title", filterFields: ["vaultId"] }` — Full-text search on note title, scoped by vault

#### `userSettings`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"userSettings">` | Primary key |
| `userId` | `v.string()` | Clerk `tokenIdentifier` identifying the user |
| `openRouterKey` | `v.optional(v.string())` | OpenRouter API key for chat edit mode |

**Indexes:**
- `by_user` → `["userId"]` — Lookup settings by user

#### `apiKeys`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"apiKeys">` | Primary key |
| `keyHash` | `v.string()` | SHA-256 hash of the raw API key (the full key is never stored) |
| `keyPrefix` | `v.string()` | First 10 characters of the key for display (e.g. `mk_a1b2c3d`) |
| `vaultId` | `v.id("vaults")` | The vault this key grants access to |
| `userId` | `v.string()` | Clerk `tokenIdentifier` of the key's owner |
| `name` | `v.string()` | User-provided label (e.g. "Claude Code") |
| `createdAt` | `v.number()` | Creation timestamp |
| `lastUsedAt` | `v.optional(v.number())` | Last time the key was used to authenticate an API request |

**Indexes:**
- `by_hash` → `["keyHash"]` — Fast lookup by key hash for authentication
- `by_vault` → `["vaultId"]` — List all keys for a vault

#### `vaultMembers`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"vaultMembers">` | Primary key |
| `vaultId` | `v.id("vaults")` | The vault being shared |
| `userId` | `v.string()` | Clerk `tokenIdentifier` of the member (empty string while pending) |
| `email` | `v.string()` | Normalized lowercase email, used for invite matching |
| `role` | `v.union(v.literal("editor"), v.literal("viewer"))` | Access level (owner is implicit, not stored here) |
| `invitedBy` | `v.string()` | `tokenIdentifier` of the user who sent the invite |
| `invitedAt` | `v.number()` | Invitation timestamp |
| `status` | `v.union(v.literal("pending"), v.literal("accepted"))` | Membership status |
| `acceptedAt` | `v.optional(v.number())` | Acceptance timestamp (set when invite is accepted) |

**Indexes:**
- `by_vault` → `["vaultId"]` — All members of a vault
- `by_user` → `["userId"]` — All vaults a user is a member of
- `by_vault_user` → `["vaultId", "userId"]` — Fast lookup for access checks
- `by_email_status` → `["email", "status"]` — Pending invitations by email

---

## API Reference

### Vault Operations

**File:** `convex/vaults.ts`

| Function | Type | Parameters | Auth | Returns | Description |
|----------|------|-----------|------|---------|-------------|
| `vaults.list` | Query | — | Authenticated | `(Vault & { role })[]` | List owned + shared vaults with role |
| `vaults.get` | Query | `{ id }` | Viewer+ | `Vault & { role }` | Get vault with access check |
| `vaults.create` | Mutation | `{ name }` | Authenticated | `Id<"vaults">` | Create vault |
| `vaults.rename` | Mutation | `{ id, name }` | Owner | — | Rename vault |
| `vaults.remove` | Mutation | `{ id }` | Owner | — | Delete vault + all contents + members + API keys + versions + audit log |
| `vaults.importCreateVault` | Internal Mutation | `{ name, userId, settings? }` | Internal | `Id<"vaults">` | Create vault (called from import action) |

### Folder Operations

**File:** `convex/folders.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `folders.list` | Query | `{ vaultId }` | `Folder[]` | List vault's folders |
| `folders.create` | Mutation | `{ name, vaultId, parentId? }` | `Id<"folders">` | Create folder |
| `folders.rename` | Mutation | `{ id, name }` | — | Rename folder |
| `folders.move` | Mutation | `{ id, parentId? }` | — | Move folder to new parent |
| `folders.remove` | Mutation | `{ id }` | — | Cascading soft-delete folder + all descendants and contained notes |
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
| `notes.remove` | Mutation | `{ id }` | — | Soft-delete note (sets `isDeleted`, `deletedAt`, `deletedBy`; creates version snapshot) |
| `notes.search` | Query | `{ vaultId, query }` | `Note[]` | Full-text search via dual-index (title + content), merged, deduped, max 20 results |
| `notes.getBacklinks` | Query | `{ noteId }` | `{ noteId, noteTitle, context }[]` | Get notes linking to this note |
| `notes.getUnlinkedMentions` | Query | `{ noteId }` | `{ noteId, noteTitle, context }[]` | Get unlinked title mentions |
| `notes.importBatch` | Mutation | `{ notes }` | — | Batch-create notes (called from client during vault import) |

### API Key Operations

**File:** `convex/apiKeys.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `apiKeys.list` | Query | `{ vaultId }` | `{ _id, keyPrefix, name, createdAt, lastUsedAt }[]` | List API keys for a vault (Clerk JWT auth) |
| `apiKeys.create` | Action | `{ vaultId, name }` | `{ key }` | Generate a new API key (`mk_<64hex>`), store SHA-256 hash, return raw key once |
| `apiKeys.revoke` | Mutation | `{ id }` | — | Delete an API key (Clerk JWT auth, ownership check) |
| `apiKeys.validateKey` | Internal Query | `{ keyHash }` | `{ userId, vaultId, keyId } \| null` | Lookup key by hash for httpAction auth |
| `apiKeys.touchLastUsed` | Internal Mutation | `{ id }` | — | Update `lastUsedAt` timestamp |
| `apiKeys.getVaultForUser` | Internal Query | `{ vaultId, userId }` | `Vault \| null` | Verify vault ownership (used by create action) |
| `apiKeys.insertKey` | Internal Mutation | `{ keyHash, keyPrefix, vaultId, userId, name, createdAt }` | `Id<"apiKeys">` | Store key record (used by create action) |

### Sharing Operations

**File:** `convex/sharing.ts`

| Function | Type | Parameters | Auth | Returns | Description |
|----------|------|-----------|------|---------|-------------|
| `sharing.inviteCollaborator` | Mutation | `{ vaultId, email, role }` | Owner | `Id<"vaultMembers">` | Invite a user by email |
| `sharing.acceptInvitation` | Mutation | `{ membershipId, email }` | Authenticated | — | Accept a pending invite |
| `sharing.getPendingInvitations` | Query | `{ email }` | Authenticated | `(VaultMember & { vaultName })[]` | List pending invites by email |
| `sharing.listCollaborators` | Query | `{ vaultId }` | Viewer+ | `{ owner, members }` | List all collaborators |
| `sharing.updateCollaboratorRole` | Mutation | `{ membershipId, role }` | Owner | — | Change a collaborator's role |
| `sharing.removeCollaborator` | Mutation | `{ membershipId }` | Owner or self | — | Remove collaborator or leave vault |

### Auth Module

**File:** `convex/auth.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `getVaultRole` | Helper | `(db, vaultId, userId)` | `VaultRole \| null` | Determine user's role in a vault |
| `verifyVaultAccess` | Helper | `(db, vaultId, userId, minimumRole)` | `VaultRole` | Verify access, throw on insufficient role |
| `auth.checkVaultAccess` | Internal Query | `{ vaultId, userId, minimumRole }` | `VaultRole \| null` | Access check for httpActions |

### Internal API (Auth-free)

**File:** `convex/internalApi.ts`

Internal queries and mutations called by httpActions after API key validation. Each validates that the resource belongs to the given vault (defense-in-depth). These mirror the logic in `folders.ts` and `notes.ts` but skip `ctx.auth` checks. All mutations call `logAudit()` and `maybeCreateSnapshot()` for full audit and version history coverage. Each mutation accepts an optional `userId` parameter (passed from the API key auth context); defaults to `"api"` if omitted.

| Function | Type | Parameters | Description |
|----------|------|-----------|-------------|
| `internalApi.getVault` | Internal Query | `{ vaultId }` | Get vault name and createdAt |
| `internalApi.listFolders` | Internal Query | `{ vaultId }` | List all active (non-deleted) folders in vault |
| `internalApi.createFolder` | Internal Mutation | `{ name, vaultId, parentId?, userId? }` | Create folder + audit log |
| `internalApi.renameFolder` | Internal Mutation | `{ id, vaultId, name, userId? }` | Rename folder + audit log |
| `internalApi.moveFolder` | Internal Mutation | `{ id, vaultId, parentId?, userId? }` | Move folder + audit log |
| `internalApi.removeFolder` | Internal Mutation | `{ id, vaultId, userId? }` | Cascading soft-delete + snapshots + audit log |
| `internalApi.listNotes` | Internal Query | `{ vaultId }` | List all active (non-deleted) notes in vault |
| `internalApi.getNote` | Internal Query | `{ id, vaultId }` | Get note (vault ownership check) |
| `internalApi.createNote` | Internal Mutation | `{ title, vaultId, folderId?, userId? }` | Create note + audit log |
| `internalApi.updateNote` | Internal Mutation | `{ id, vaultId, content, userId? }` | Update note + snapshot + audit log |
| `internalApi.renameNote` | Internal Mutation | `{ id, vaultId, title, userId? }` | Rename note + wiki links + snapshot + audit log |
| `internalApi.moveNote` | Internal Mutation | `{ id, vaultId, folderId?, userId? }` | Move note + snapshot + audit log |
| `internalApi.removeNote` | Internal Mutation | `{ id, vaultId, userId? }` | Soft-delete note + snapshot + audit log |
| `internalApi.searchNotes` | Internal Query | `{ vaultId, query }` | Full-text search (title + content) |
| `internalApi.getBacklinks` | Internal Query | `{ noteId, vaultId }` | Get backlinks |
| `internalApi.getUnlinkedMentions` | Internal Query | `{ noteId, vaultId }` | Get unlinked mentions |

### Import Operations

**File:** `convex/importVault.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `importVault.createVaultWithFolders` | Action | `{ name, settings?, folders }` | `{ vaultId, folderIdMap }` | Orchestrates vault + folder creation server-side. See [Import Vault](./import-vault.md). |

### Chat Operations (Q&A Mode)

**File:** `convex/chat.ts` (httpAction), `convex/chatHelpers.ts` (internalQuery)

| Function | Type | Description |
|----------|------|-------------|
| `chat` | httpAction | Streaming AI chat endpoint. Authenticates via `ctx.auth.getUserIdentity()`, builds context from vault notes via `chatHelpers.buildContext`, calls Claude API (`claude-sonnet-4-5-20250929`) with streaming, returns `text/plain; charset=utf-8`. |
| `chatHelpers.buildContext` | internalQuery | Accepts `{ vaultId, query }`. Searches notes via `search_title` and `search_content` indexes (15 each), merges/deduplicates. Builds two-tier context: top 5 with full content, next 10 title-only, 80K char limit. Falls back to fetching 15 notes by vault index if no search results. |

### Chat Edit Operations (Edit Mode)

**File:** `convex/chatEdit.ts` (httpAction), `convex/chatEditHelpers.ts` (internalQuery)

| Function | Type | Description |
|----------|------|-------------|
| `chatEdit` | httpAction | Streaming AI chat with note editing capability. Authenticates via `ctx.auth.getUserIdentity()`, retrieves user's OpenRouter API key, builds context via `chatEditHelpers.buildEditContext` (includes active note), calls OpenRouter API (`anthropic/claude-sonnet-4`) with streaming. Returns 400 with JSON `{ error: "..." }` on OpenRouter API errors. |
| `chatEditHelpers.buildEditContext` | internalQuery | Accepts `{ vaultId, query, activeNoteId? }`. Includes the active note's full content first (labelled as "ACTIVE NOTE"), then searches remaining notes via dual-index. Same two-tier context and 80K char limit as Q&A mode. |

### User Settings Operations

**File:** `convex/userSettings.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `userSettings.hasOpenRouterKey` | Query | — | `{ hasKey: boolean }` | Check if user has an OpenRouter key configured |
| `userSettings.saveOpenRouterKey` | Mutation | `{ key }` | — | Save or update OpenRouter API key |
| `userSettings.deleteOpenRouterKey` | Mutation | — | — | Remove OpenRouter API key |
| `userSettings.getOpenRouterKey` | Internal Query | `{ userId }` | `string \| null` | Retrieve key (used by `chatEdit` httpAction) |

### API Key Validation

**File:** `convex/testKey.ts` (httpAction)

| Function | Type | Description |
|----------|------|-------------|
| `testKey` | httpAction | Validates an OpenRouter API key. Authenticates user, accepts `{ key }` in POST body, calls OpenRouter's free `GET /api/v1/auth/key` endpoint. Returns JSON `{ valid: true }` on success or `{ valid: false, error: "..." }` on failure. |

### Onboarding Operations

**File:** `convex/onboarding.ts` (httpAction)

| Function | Type | Description |
|----------|------|-------------|
| `onboarding` | httpAction | AI-powered vault creation. Accepts user's topic/preferences, calls Claude to generate starter notes, streams the response back. |

### HTTP Routes

**File:** `convex/http.ts`

#### Internal endpoints (Clerk JWT auth)

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `/api/chat` | POST | `chat` | AI chat streaming endpoint (Q&A mode) |
| `/api/chat` | OPTIONS | `chat` | CORS preflight handling |
| `/api/chat-edit` | POST | `chatEdit` | AI chat streaming endpoint (edit mode, requires OpenRouter key) |
| `/api/chat-edit` | OPTIONS | `chatEdit` | CORS preflight handling |
| `/api/test-openrouter-key` | POST | `testKey` | Validate an OpenRouter API key |
| `/api/test-openrouter-key` | OPTIONS | `testKey` | CORS preflight handling |
| `/api/onboarding` | POST | `onboarding` | AI onboarding vault generation |
| `/api/onboarding` | OPTIONS | `onboarding` | CORS preflight handling |

#### Public REST API v1 (API key auth: `Authorization: Bearer mk_...`)

**Files:** `convex/apiVaults.ts`, `convex/apiFolders.ts`, `convex/apiNotes.ts`, `convex/apiHelpers.ts`

All endpoints use the `apiKeyAction` wrapper which handles OPTIONS preflight, extracts the API key from the `Authorization` header, hashes it with SHA-256, validates against the `apiKeys` table, and passes `{ vaultId, userId }` to the handler. The vault is implicit from the API key — no `vaultId` parameter is needed.

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/vault` | GET | Get vault info (name, createdAt) |
| `/api/v1/folders` | GET | List all folders |
| `/api/v1/folders` | POST | Create folder `{ name, parentId? }` |
| `/api/v1/folders/rename` | PATCH | Rename folder `{ id, name }` |
| `/api/v1/folders/move` | PATCH | Move folder `{ id, parentId? }` |
| `/api/v1/folders` | DELETE | Delete folder `?id=` |
| `/api/v1/notes` | GET | List all notes |
| `/api/v1/notes/get` | GET | Get note `?id=` |
| `/api/v1/notes/search` | GET | Search notes `?query=` |
| `/api/v1/notes/backlinks` | GET | Get backlinks `?noteId=` |
| `/api/v1/notes/unlinked-mentions` | GET | Get unlinked mentions `?noteId=` |
| `/api/v1/notes` | POST | Create note `{ title, folderId? }` |
| `/api/v1/notes/update` | PATCH | Update note `{ id, content }` |
| `/api/v1/notes/rename` | PATCH | Rename note `{ id, title }` |
| `/api/v1/notes/move` | PATCH | Move note `{ id, folderId? }` |
| `/api/v1/notes` | DELETE | Delete note `?id=` |

Response format: `{ ok: true, data: ... }` on success, `{ ok: false, error: "..." }` on error.

A public-facing API documentation page is available at `/docs` (rendered by `src/components/docs/DocsPage.tsx`). This page is accessible without authentication and documents all 16 REST API v1 endpoints with parameter tables, curl examples, and JSON response examples. A link to the docs page is shown in the Settings dialog next to the API key manager.

---

## Authorization Patterns

### Clerk JWT Auth (frontend queries/mutations)

Every query and mutation follows the same authorization pattern, using the shared auth module:

```typescript
import { verifyVaultAccess } from "./auth";

export const someFunction = query({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Role-based access check (throws if insufficient)
    await verifyVaultAccess(ctx.db, args.vaultId, identity.tokenIdentifier, "viewer");

    // ... proceed with operation
  },
});
```

- **Authentication**: Every function calls `ctx.auth.getUserIdentity()` to verify the Clerk JWT.
- **Authorization**: `verifyVaultAccess` checks the user's role against a minimum requirement. Owner is determined by `vault.userId` match; editor/viewer by the `vaultMembers` table.
- **Data isolation**: Queries are scoped by `vaultId`. The role check ensures only authorized users can access vault data.
- **httpActions**: Use `ctx.runQuery(internal.auth.checkVaultAccess, ...)` since httpActions cannot call helper functions directly.

### API Key Auth (REST API v1)

The REST API uses vault-scoped API keys (`mk_<64hex>`) instead of Clerk JWTs:

```typescript
// In apiHelpers.ts — apiKeyAction wrapper
async function requireApiKeyAuth(ctx, request) {
  // 1. Extract "Bearer mk_..." from Authorization header
  // 2. SHA-256 hash the raw key
  // 3. Lookup by hash in apiKeys table
  // 4. Return { vaultId, userId } or 401
  // 5. Fire-and-forget: update lastUsedAt
}
```

- **Authentication**: The `apiKeyAction` wrapper extracts and hashes the bearer token, then looks it up via the `by_hash` index on the `apiKeys` table.
- **Authorization**: The API key is scoped to a single vault. The `vaultId` is passed to internal functions which additionally verify resource ownership (defense-in-depth).
- **Key security**: Only the SHA-256 hash is stored. The raw key is shown once at creation and never retrievable again.
- **No vault listing**: API key users cannot list or access other vaults — the vault is implicit from the key.

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

When a note is renamed, the mutation scans all **active** (non-deleted) notes in the vault and updates wiki link references:

```
For each non-deleted note in vault:
  Replace [[oldTitle]] → [[newTitle]]
  Replace [[oldTitle| → [[newTitle|
  Replace [[oldTitle# → [[newTitle#
```

Soft-deleted notes are skipped during wiki link propagation.

### `notes.update` — Audit Logging & Version Snapshots

When a note is updated, the mutation:
1. Sets `updatedBy` to the current user
2. Calls `maybeCreateSnapshot` with trigger `auto` (throttled to 1 per 5 min)
3. Logs an audit entry

### `notes.remove` — Soft Delete

```
Create version snapshot (trigger: delete)
Patch note: isDeleted = true, deletedAt = now, deletedBy = userId
Log audit entry (action: delete)
```

### `folders.remove` — Cascading Soft Delete

```
Recursively collect all descendant folder IDs
For each descendant folder:
  Soft-delete all notes in the folder (same deletedAt timestamp)
  Soft-delete the folder
Soft-delete all notes in the root folder
Soft-delete the root folder
Log audit entry (action: delete)
```

All items in a cascade share the same `deletedAt` timestamp, enabling batch restore.

### `vaults.remove` — Cascade Deletion

```
Delete all noteVersions where vaultId = vault._id
Delete all auditLog entries where vaultId = vault._id
Delete all notes where vaultId = vault._id
Delete all folders where vaultId = vault._id
Delete all vaultMembers where vaultId = vault._id
Delete all apiKeys where vaultId = vault._id
Delete the vault document
```

### Audit Log API

**File:** `convex/auditLog.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `auditLog.listByVault` | Query | `{ vaultId, limit? }` | `AuditEntry[]` | All entries for a vault, newest first |
| `auditLog.listByTarget` | Query | `{ targetId }` | `AuditEntry[]` | All actions on a specific note/folder |

### Version History API

**File:** `convex/noteVersions.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `noteVersions.listByNote` | Query | `{ noteId }` | `Version[]` | All versions for a note, newest first |
| `noteVersions.get` | Query | `{ id }` | `Version` | Get a specific version |
| `noteVersions.restoreVersion` | Mutation | `{ noteId, versionId }` | — | Restore note from a version snapshot |

### Trash API

**File:** `convex/trash.ts`

| Function | Type | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `trash.listDeleted` | Query | `{ vaultId }` | `TrashItem[]` | All soft-deleted items, newest first |
| `trash.getDeletedCount` | Query | `{ vaultId }` | `number` | Count of items in trash |
| `trash.restoreNote` | Mutation | `{ id }` | — | Restore a soft-deleted note |
| `trash.restoreFolder` | Mutation | `{ id }` | — | Restore folder + descendants |
| `trash.permanentDeleteNote` | Mutation | `{ id }` | — | Hard-delete note + versions (owner only) |
| `trash.permanentDeleteFolder` | Mutation | `{ id }` | — | Hard-delete folder (owner only) |
| `trash.emptyTrash` | Mutation | `{ vaultId }` | — | Hard-delete all trash items (owner only) |
