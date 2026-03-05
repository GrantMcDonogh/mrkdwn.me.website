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

Lists all vaults the authenticated user has access to (owned + shared).

- **Auth**: Required
- **Parameters**: None
- **Returns**: Array of vault objects, each with a `role` field (`"owner"`, `"editor"`, or `"viewer"`). Owned vaults are queried via the `by_user` index; shared vaults via the `vaultMembers` `by_user` index (accepted memberships only).
- **Usage**: Called by `VaultSelector` to display the vault list, split into "Your Vaults" and "Shared with You" sections.

#### `vaults.get`

Retrieves a single vault by ID with access verification.

- **Auth**: Required
- **Parameters**: `{ id: Id<"vaults"> }`
- **Returns**: Vault document with a `role` field
- **Throws**: If the vault does not exist or the user does not have at least viewer access

### Mutations

#### `vaults.create`

Creates a new vault for the authenticated user.

- **Auth**: Required
- **Parameters**: `{ name: string }`
- **Behavior**: Inserts a new vault with the current timestamp
- **Returns**: The new vault's `Id<"vaults">`

#### `vaults.rename`

Renames an existing vault.

- **Auth**: Owner only
- **Parameters**: `{ id: Id<"vaults">, name: string }`
- **Behavior**: Verifies owner access via `verifyVaultAccess`, then patches the vault name

#### `vaults.remove`

Deletes a vault and all of its contents.

- **Auth**: Owner only
- **Parameters**: `{ id: Id<"vaults"> }`
- **Behavior**:
  1. Verifies owner access via `verifyVaultAccess`
  2. Queries all note versions in the vault → deletes each one
  3. Queries all audit log entries in the vault → deletes each one
  4. Queries all notes in the vault → deletes each one
  5. Queries all folders in the vault → deletes each one
  6. Queries all vault members → deletes each one
  7. Queries all API keys for the vault → deletes each one
  8. Deletes the vault document itself
- **Cascade**: Full cascade deletion — no orphaned folders, notes, memberships, API keys, versions, or audit entries remain

### Internal Mutations

#### `vaults.importCreateVault`

Creates a vault document without client-facing auth (called from the `importVault.createVaultWithFolders` action which already verified auth).

- **Type**: Internal mutation
- **Parameters**: `{ name: string, userId: string, settings?: any }`
- **Returns**: `Id<"vaults">`

## AI Onboarding Wizard

Users can generate a personalized starter vault via a guided AI wizard.

### Entry Point

A "Set Up with AI" button with a `Sparkles` icon appears in the `VaultSelector`, alongside "Create New Vault" and "Import Vault". Clicking it opens the `OnboardingWizardDialog`.

### Wizard Flow

**File:** `src/components/vault/OnboardingWizardDialog.tsx`

The dialog is a state machine with the following states:

| State | UI |
|---|---|
| `questions` | Chat-like interface — bot asks questions, user selects options |
| `generating` | Spinner + "Generating your personalized vault…" |
| `preview` | Editable vault name, folder/note counts, "Create Vault" button |
| `creating` | Progress spinner ("Creating vault and folders…" → "Creating notes (batch N of M)…") |
| `done` | Checkmark + auto-navigates to new vault after 1 second |
| `error` | Error message + "Try Again" button (resets to `questions`) |

### Questions

**File:** `src/lib/onboardingQuestions.ts`

| # | Question | Type | Options |
|---|----------|------|---------|
| 1 | Purpose | Single-select | Personal knowledge, Work, Academic/Research, Creative/Projects, General second brain |
| 2 | Topics | Multi-select (max 3) | Technology, Business, Science, Arts, Self-improvement, Mixed |
| 3 | Organization | Single-select | By topic, By project, Flat with links, Chronological |
| 4 | Starter Content | Single-select | Templates & examples, Pre-filled notes, Empty structure only, Full starter kit |

### Backend

**File:** `convex/onboarding.ts`

An HTTP action that calls the Claude API (`claude-sonnet-4-5-20250929`, max 8192 tokens) with a system prompt that instructs Claude to generate a vault structure (3–8 folders, 5–15 notes with `[[Wiki Link]]` syntax) as JSON.

**File:** `convex/http.ts` — registers `POST /api/onboarding` and `OPTIONS /api/onboarding` routes.

### Client Hook

**File:** `src/hooks/useOnboardingGenerate.ts`

Returns a `generate(answers)` function that calls the `/api/onboarding` endpoint with the user's answers and Clerk auth token. Returns a `GeneratedVault` object (`{ vaultName, folders, notes }`).

### Vault Creation

After generation, the wizard reuses the same import infrastructure:
1. Calls `createVaultWithFolders` action (creates vault + all folders server-side)
2. Maps temporary folder IDs to real database IDs
3. Uses `batchNotes()` to split notes into size-limited batches
4. Calls `notes.importBatch` mutation for each batch

### Response Parsing

**File:** `src/lib/onboardingParse.ts`

Utilities for extracting and validating the Claude API response:
- Strips markdown code fencing from responses
- Validates JSON structure (requires `vaultName`, `folders` array, `notes` array)

### Tests

**Files:** `src/lib/onboardingParse.test.ts` (36 tests), `src/lib/onboardingQuestions.test.ts` (12 tests)

### File Summary

| File | Purpose |
|---|---|
| `src/components/vault/OnboardingWizardDialog.tsx` | Wizard dialog UI (state machine) |
| `src/hooks/useOnboardingGenerate.ts` | Client hook for AI generation |
| `src/lib/onboardingQuestions.ts` | Question definitions |
| `src/lib/onboardingParse.ts` | Response parsing utilities |
| `convex/onboarding.ts` | Backend HTTP action (Claude API) |
| `convex/http.ts` | Route registration |
| `src/components/vault/VaultSelector.tsx` | Entry point button |

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
| Pending Invitations | Shown at the top when the user has pending vault invitations. Each card shows vault name, role, and accept/decline buttons. Uses `PendingInvitations` component. |
| Your Vaults | Vertical stack of owned vault cards with hover-reveal action buttons (Users for share, Pencil for rename, Download for export, Trash2 for delete) |
| Shared with You | Separate section for vaults shared with the user. Shows role badges (editor/viewer). "Leave" button instead of delete. No rename or share buttons. |
| Create Button | Full-width dashed-border card with `Plus` icon and "Create New Vault" text |
| Import Button | Full-width dashed-border card with `Upload` icon and "Import Vault" text. Opens the Import Vault dialog. |
| AI Onboarding Button | Full-width dashed-border card with `Sparkles` icon and "Set Up with AI" text. Opens the AI Onboarding Wizard dialog. |
| Create Form | Inline form with text input, "Create" submit button, and "Cancel" button |
| Empty State | "No vaults yet. Create one to get started." message (shown when no vaults exist) |

#### Interactions

1. **Select Vault**: Clicking a vault card dispatches `SET_VAULT` action with the vault's `role`, which transitions the UI to the main `AppLayout`.
2. **Create Vault**: Clicking "Create New Vault" reveals an input field. Submitting calls `vaults.create` mutation.
3. **Share Vault**: Clicking the Users icon on an owned vault card opens the `ShareVaultDialog` for inviting and managing collaborators.
4. **Rename Vault**: Double-clicking the Pencil icon on an owned vault card enables inline editing. On blur or Enter, calls `vaults.rename`. Pressing Escape cancels the rename without saving.
5. **Download Vault**: Clicking the Download icon fetches all folders and notes, builds a ZIP client-side using JSZip, and triggers a browser download of `{VaultName}.zip`. See [Download Vault](./download-vault.md) for the full flow.
6. **Delete Vault**: Clicking the Trash2 icon on an owned vault triggers a native `window.confirm()` dialog. On confirm, calls `vaults.remove`.
7. **Leave Vault**: Clicking "Leave" on a shared vault calls `sharing.removeCollaborator` with the user's own membership.
8. **Accept/Decline Invite**: Pending invitations show accept (checkmark) and decline (X) buttons. Accept calls `sharing.acceptInvitation`; decline calls `sharing.removeCollaborator`.
9. **Import Vault**: Clicking "Import Vault" opens `ImportVaultDialog`, a modal that guides the user through selecting a local Obsidian vault folder, previewing its contents, and importing all notes, folders, and settings. See [Import Vault](./import-vault.md) for the full flow.
10. **AI Onboarding**: Clicking "Set Up with AI" opens the `OnboardingWizardDialog`, a multi-step wizard that asks about the user's knowledge management goals and generates a personalized starter vault using Claude. See the AI Onboarding Wizard section above.

#### State Management

- The selected vault ID and role are stored in the workspace context (`vaultId` and `vaultRole` fields).
- Dispatching `SET_VAULT` (with optional `role`) sets the vault and role, and resets the entire workspace state (`...initialState`), including sidebar, right panel, search query, and split direction.
- Dispatching `LEAVE_VAULT` clears the vault, role, and resets the entire workspace state, returning to the selector.

### Vault Navigation

- The sidebar header contains a **Vault Switcher** dropdown that lists all vaults with role badges on shared vaults. Clicking a different vault dispatches `SET_VAULT` (with role) to switch inline. Owners see "Share Vault..." and "Download Vault" options. Non-owners see "Leave Vault" instead of "Delete Vault". A "Manage Vaults..." option dispatches `LEAVE_VAULT` to return to the full-page vault selector.
- The command palette provides "Download Vault", "Manage Vaults", and "Share Vault" (owner-only) commands.
- Switching vaults clears all open tabs and panes, resetting the workspace state (including role).

## Download / Export Vault

Users can download any vault as a `.zip` file containing all notes as `.md` files in the vault's folder hierarchy. The ZIP is built entirely client-side using JSZip — no backend changes are needed. See [Download Vault](./download-vault.md) for full details.

## Vault API Keys

Each vault can have multiple API keys for REST API and MCP server access. Keys are managed in Settings → Vault API Keys.

- **Vault-scoped**: Each key grants access to exactly one vault.
- **Hash-only storage**: Only the SHA-256 hash is stored in the `apiKeys` table.
- **One-time reveal**: The raw key is shown once at creation and cannot be retrieved.
- **Revocable**: Keys can be deleted immediately from the Settings UI.
- **Last used tracking**: Each key tracks when it was last used for an API request.

See [Authentication](./authentication.md#api-key-authentication-rest-api) for implementation details.

## Sharing & Access Control

Vaults support multi-user access with three roles:

| Role | Source | Permissions |
|------|--------|-------------|
| **Owner** | Implicit — `vaults.userId` matches the user's `tokenIdentifier` | Full access: CRUD notes/folders, rename/delete vault, manage API keys, invite/remove collaborators |
| **Editor** | Stored in `vaultMembers` table | Read + write notes and folders, use chat edit mode. Cannot rename/delete vault, manage sharing, or manage API keys. |
| **Viewer** | Stored in `vaultMembers` table | Read-only. Can browse notes/folders and use Q&A chat. Editor locked to preview mode, no create/delete/drag-drop. |

### Role Hierarchy

Owner is never stored in the `vaultMembers` table — it is determined by matching `vaults.userId`. The role hierarchy is enforced by the shared auth module (`convex/auth.ts`):

```
owner (3) > editor (2) > viewer (1)
```

Each backend function specifies a `minimumRole` parameter to `verifyVaultAccess()`, which checks the caller's role against the hierarchy. See [Authentication](./authentication.md) for details.

### Sharing Data Model

#### `vaultMembers` table (`convex/schema.ts`)

```typescript
vaultMembers: defineTable({
  vaultId: v.id("vaults"),
  userId: v.string(),        // Clerk tokenIdentifier (empty string while pending)
  email: v.string(),         // normalized lowercase, used for invite matching
  role: v.union(v.literal("editor"), v.literal("viewer")),
  invitedBy: v.string(),     // tokenIdentifier of inviter
  invitedAt: v.number(),
  status: v.union(v.literal("pending"), v.literal("accepted")),
  acceptedAt: v.optional(v.number()),
})
  .index("by_vault", ["vaultId"])
  .index("by_user", ["userId"])
  .index("by_vault_user", ["vaultId", "userId"])
  .index("by_email_status", ["email", "status"]),
```

### Invite Flow

1. **Owner invites** by email via `sharing.inviteCollaborator` — creates a `vaultMembers` row with `userId: ""` and `status: "pending"`.
2. **Invitee logs in** — `PendingInvitations` component queries `sharing.getPendingInvitations` using the user's email from the Clerk frontend SDK (`useUser().primaryEmailAddress.emailAddress`).
3. **Invitee accepts** — `sharing.acceptInvitation` fills in the `userId` (Clerk `tokenIdentifier`) and sets `status: "accepted"`.
4. **Vault appears** — `vaults.list` now returns shared vaults alongside owned vaults, each with a `role` field.

Emails are normalized with `.toLowerCase().trim()` at every point of entry. Duplicate invites to the same email are rejected.

### Sharing API

**File:** `convex/sharing.ts`

| Function | Type | Auth | Description |
|----------|------|------|-------------|
| `inviteCollaborator` | Mutation | Owner | Invite a user by email with a role |
| `acceptInvitation` | Mutation | Invited user | Accept a pending invite (matches email) |
| `getPendingInvitations` | Query | Authenticated | List pending invites for a given email |
| `listCollaborators` | Query | Viewer+ | List all collaborators for a vault |
| `updateCollaboratorRole` | Mutation | Owner | Change a collaborator's role |
| `removeCollaborator` | Mutation | Owner or self | Remove a collaborator (or leave vault) |

### Sharing UI

#### ShareVaultDialog

**File:** `src/components/vault/ShareVaultDialog.tsx`

Modal dialog for vault owners to manage sharing:
- Email input + role dropdown (editor/viewer) + invite button
- Collaborator list with role dropdowns and remove buttons
- Owner row shown first (non-editable)
- Opened from the vault selector (Users icon), sidebar (Share Vault... action), or command palette

#### PendingInvitations

**File:** `src/components/vault/PendingInvitations.tsx`

Shown at the top of the vault selector when the user has pending invites. Uses `useUser()` from Clerk to get the user's email. Each invite shows the vault name and role, with accept (checkmark) and decline (X) buttons.

#### RoleBadge

**File:** `src/components/vault/RoleBadge.tsx`

Small reusable badge component. Editor = amber, viewer = muted gray. Hidden for owner role. Used in the vault selector, sidebar vault switcher, and app toolbar.

### Permission Gating (Frontend)

The `useVaultRole()` hook (`src/hooks/useVaultRole.ts`) derives boolean permission flags from the workspace state:

| Flag | Owner | Editor | Viewer |
|------|-------|--------|--------|
| `canEdit` | yes | yes | no |
| `canManage` | yes | no | no |
| `canCreateNotes` | yes | yes | no |
| `canDeleteNotes` | yes | yes | no |
| `canEditNotes` | yes | yes | no |
| `canManageFolders` | yes | yes | no |
| `canDragDrop` | yes | yes | no |
| `canPermanentDelete` | yes | no | no |
| `canDeleteVault` | yes | no | no |
| `canShareVault` | yes | no | no |
| `canRenameVault` | yes | no | no |

These flags gate UI controls across the app:

| Component | Gated Behavior |
|-----------|---------------|
| `FileExplorer` | Create/delete/upload/rename buttons hidden for viewers; drag-and-drop disabled |
| `NoteView` | Forced preview mode for viewers; "Read-only" banner shown |
| `TabBar` | Edit/preview toggle hidden for viewers |
| `ChatPanel` | "Edit mode" toggle hidden for viewers |
| `AppLayout` | Ctrl+E blocked for viewers; share button shown for owners only |
| `SettingsDialog` | API Key Manager hidden for non-owners |
| `CommandPalette` | "Share Vault" command owner-only; "Toggle Preview/Edit Mode" gated on canEditNotes |

### Access Revocation

When a collaborator is removed while they have the vault open, `vaults.get` returns `null` (their access is gone). A `useEffect` in `AppLayout` detects this and dispatches `LEAVE_VAULT`, returning the user to the vault selector.

### Security Properties

- Owner role is implicit from `vaults.userId` — it cannot be stored or faked in `vaultMembers`.
- `vaultMembers.role` only allows `"editor"` or `"viewer"` — no privilege escalation to owner.
- Pending memberships (`status: "pending"`) do not grant access — `getVaultRole` requires `status === "accepted"`.
- A pending member has `userId: ""`, which cannot match any real Clerk `tokenIdentifier`.
- API keys remain owner-only (they grant full programmatic access).

## Cascade Deletion Behavior

When a vault is deleted:

```
Vault
 ├── NoteVersion 1 → deleted
 ├── NoteVersion 2 → deleted
 ├── AuditLog 1    → deleted
 ├── AuditLog 2    → deleted
 ├── Note 1        → deleted
 ├── Note 2        → deleted
 ├── Folder A      → deleted
 │   ├── Note 3    → deleted (via vault query, not folder cascade)
 │   └── Folder B  → deleted
 ├── VaultMember 1 → deleted
 ├── VaultMember 2 → deleted
 ├── ApiKey 1      → deleted
 └── Note 4        → deleted
```

All note versions, audit log entries, notes, folders, vault members, and API keys are queried by `vaultId` and deleted individually before the vault document itself is removed. This ensures no orphaned data remains.

When a **folder** is deleted (soft delete):

```
Folder A            → soft-deleted (isDeleted=true, deletedAt=T)
 ├── Note 1         → soft-deleted (same deletedAt=T)
 ├── Folder B       → soft-deleted (same deletedAt=T)
 │   ├── Note 2     → soft-deleted (same deletedAt=T)
 │   └── Folder C   → soft-deleted (same deletedAt=T)
 └── Note 3         → soft-deleted (same deletedAt=T)
```

All items in a cascade share the same `deletedAt` timestamp, enabling batch restore from the Trash panel. See [Audit Log, Version History & Trash](./audit-log-version-history-trash.md) for details.
