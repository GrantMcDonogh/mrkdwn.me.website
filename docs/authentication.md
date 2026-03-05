# Authentication

## Overview

mrkdwn.me uses [Clerk](https://clerk.com) (`@clerk/clerk-react`) for authentication. The Clerk-hosted `<SignIn>` component handles all login/signup UI, including email/password and any OAuth providers configured in the Clerk dashboard. All backend operations require authentication — unauthenticated users are shown the Clerk sign-in page.

## Architecture

### Backend Configuration

**`convex/auth.config.ts`**

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

- Configures Convex to validate JWTs issued by the Clerk instance specified in `CLERK_JWT_ISSUER_DOMAIN`.
- The `applicationID` `"convex"` matches the JWT template name configured in the Clerk dashboard.

**`convex/http.ts`**

```typescript
import { httpRouter } from "convex/server";
import { chat } from "./chat";

const http = httpRouter();

http.route({ path: "/api/chat", method: "POST", handler: chat });
http.route({ path: "/api/chat", method: "OPTIONS", handler: chat });

export default http;
```

- There are no auth-related HTTP routes. OAuth callbacks are handled entirely by Clerk's hosted infrastructure.
- HTTP routes include AI streaming endpoints and the REST API v1 (see [database-and-api.md](./database-and-api.md)).

### Frontend Integration

**`src/main.tsx`**

```tsx
<StrictMode>
  <ClerkProvider
    publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string}
    signInForceRedirectUrl={window.location.origin + "/"}
    signUpForceRedirectUrl={window.location.origin + "/"}
  >
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProviderWithClerk>
  </ClerkProvider>
</StrictMode>
```

- `ClerkProvider` wraps the entire application, providing Clerk auth state.
- `ConvexProviderWithClerk` bridges Clerk sessions to Convex, passing JWTs to the backend automatically.
- The `useAuth` hook from Clerk is passed to `ConvexProviderWithClerk` so Convex can obtain auth tokens.

**`src/App.tsx`**

```tsx
function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-obsidian-bg flex items-center justify-center">
        <p className="text-obsidian-text-muted">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <WorkspaceProvider>
      <AppRouter />
    </WorkspaceProvider>
  );
}

export default function App() {
  const { pathname } = useLocation();

  if (pathname === "/docs") {
    return <DocsPage />;
  }

  return <AuthenticatedApp />;
}
```

- The top-level `App` checks the URL path first. The `/docs` route renders the public API documentation page without any auth.
- Auth logic is extracted into `AuthenticatedApp` to preserve React hook ordering rules (hooks can't be called conditionally).
- Uses `useConvexAuth()` to check authentication status.
- Shows an inline loading indicator while the session is being verified.
- Renders `<AuthPage />` for unauthenticated users.
- Authenticated users get `<WorkspaceProvider>` wrapping `<AppRouter />`, which conditionally renders `<VaultSelector />` or `<AppLayout />`.

## Auth Page UI

**File:** `src/components/auth/AuthPage.tsx`

```tsx
import { SignIn } from "@clerk/clerk-react";

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-obsidian-bg flex items-center justify-center p-4">
      <SignIn
        appearance={{ variables: { colorPrimary: "#7f6df2" } }}
        forceRedirectUrl={window.location.origin + "/"}
      />
    </div>
  );
}
```

- Renders Clerk's pre-built `<SignIn />` component with a custom accent color (`#7f6df2`).
- All login UI (form fields, OAuth buttons, toggle between sign-in/sign-up, error handling) is managed by Clerk.
- The available authentication methods (email/password, Google, etc.) are configured in the Clerk dashboard, not in code.

## Authorization

All backend queries and mutations enforce authentication:

```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Not authenticated");
const userId = identity.tokenIdentifier;
```

- Every Convex function calls `ctx.auth.getUserIdentity()` to verify the JWT.
- The `tokenIdentifier` string from the identity object is used as the user ID for data ownership.
- Throws immediately if no valid identity is present.

### Shared Auth Module

**File:** `convex/auth.ts`

A centralized authorization module that replaces the previously duplicated `verifyVaultOwnership` helpers. Provides role-based access control for vault sharing.

**Role hierarchy:** `owner (3) > editor (2) > viewer (1)`

| Function | Type | Description |
|----------|------|-------------|
| `getVaultRole(db, vaultId, userId)` | Helper | Returns `"owner" \| "editor" \| "viewer" \| null`. Fast path: checks `vault.userId === userId` (owner). Slow path: queries `vaultMembers` via `by_vault_user` index for accepted memberships. |
| `verifyVaultAccess(db, vaultId, userId, minimumRole)` | Helper | Throws `"Vault not found"` if the user lacks the minimum role. Returns the actual role on success. |
| `checkVaultAccess` | Internal Query | Same logic as `verifyVaultAccess` but returns the role or `null` (no throw). Used by httpActions via `ctx.runQuery`. |

**Usage pattern:**

```typescript
import { verifyVaultAccess } from "./auth";

export const update = mutation({
  args: { id: v.id("notes"), content: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const note = await ctx.db.get(args.id);
    if (!note) throw new Error("Note not found");
    await verifyVaultAccess(ctx.db, note.vaultId, identity.tokenIdentifier, "editor");
    // ... proceed with mutation
  },
});
```

### Endpoint Permission Map

| Endpoint | Minimum Role |
|----------|-------------|
| `notes.list`, `notes.get`, `notes.search`, `notes.getBacklinks`, `notes.getUnlinkedMentions` | viewer |
| `notes.create`, `notes.update`, `notes.rename`, `notes.move`, `notes.remove`, `notes.importBatch` | editor |
| `folders.list` | viewer |
| `folders.create`, `folders.rename`, `folders.move`, `folders.remove` | editor |
| `vaults.rename`, `vaults.remove` | owner |
| `apiKeys.list` | owner |
| `sharing.inviteCollaborator` | owner |
| `sharing.listCollaborators` | viewer |
| `sharing.updateCollaboratorRole`, `sharing.removeCollaborator` | owner (or self for leave) |
| `/api/chat` | viewer |
| `/api/chat-edit` | editor |

### Data Isolation

- **Vaults** are filtered by `userId` (the Clerk `tokenIdentifier`) for owned vaults, plus `vaultMembers` for shared vaults.
- **Folders and Notes** are accessed through vaults, inheriting the vault's role-based access check via `verifyVaultAccess()`.
- Shared vaults are read-only for viewers and read-write for editors. Only owners can manage vault settings, API keys, and sharing.
- Pending invitations (not yet accepted) do **not** grant any access.

## Sign Out

Sign-out is available on the Vault Selector page via `useClerk().signOut()`:

```tsx
import { useClerk } from "@clerk/clerk-react";

const { signOut } = useClerk();
// ...
<button onClick={() => signOut()}>Sign Out</button>
```

## Session Lifecycle

1. **Sign In/Up**: User interacts with the Clerk `<SignIn>` component → Clerk handles credential validation or OAuth flow → JWT issued → `ConvexProviderWithClerk` forwards the token to Convex → client authenticated.
2. **Session Persistence**: Clerk manages session tokens and restores sessions across page reloads. The `ClerkProvider` handles token refresh automatically.
3. **Sign Out**: User clicks "Sign Out" on the vault selector → `useClerk().signOut()` is called → Clerk destroys the session → `useConvexAuth()` returns `isAuthenticated: false` → UI switches to `<AuthPage />`.

## API Key Authentication (REST API)

In addition to Clerk JWT auth for the web app, mrkdwn.me supports vault-scoped API keys for the public REST API v1 and MCP server.

### How It Works

1. User creates an API key in Settings → Vault API Keys (requires Clerk JWT auth).
2. The backend generates a random key (`mk_<64 hex chars>`), hashes it with SHA-256, and stores only the hash in the `apiKeys` table.
3. The raw key is returned once and never stored.
4. API requests include the key as `Authorization: Bearer mk_...`.
5. The `apiKeyAction` wrapper in `convex/apiHelpers.ts` hashes the incoming key and looks it up via the `by_hash` index.
6. On match, the handler receives `{ vaultId, userId }` — no further auth is needed.
7. `lastUsedAt` is updated on each use (fire-and-forget).

### Key Properties

- **Vault-scoped**: Each key grants access to exactly one vault. No vault listing is possible.
- **Hash-only storage**: Only the SHA-256 hash is persisted. Compromise of the database does not reveal raw keys.
- **Revocable**: Keys can be deleted from the Settings UI, immediately invalidating them.
- **Display prefix**: The first 10 characters (`mk_a1b2c3d`) are stored for identification in the UI.

### Management UI

**File:** `src/components/settings/ApiKeyManager.tsx`

Rendered inside the Settings dialog when a vault is active. Shows:
- List of existing keys (prefix, name, last used date)
- Create form with name input
- One-time key reveal banner with copy button after creation
- Revoke button per key

### Files

| File | Purpose |
|------|---------|
| `convex/apiKeys.ts` | Key CRUD (list, create, revoke) + internal validation functions |
| `convex/apiHelpers.ts` | `apiKeyAction` wrapper + `requireApiKeyAuth` function |
| `convex/internalApi.ts` | Auth-free internal queries/mutations called after key validation |
| `src/components/settings/ApiKeyManager.tsx` | Frontend key management UI |

## Security Considerations

- User accounts and credentials are managed entirely by Clerk's hosted infrastructure — no sensitive auth data is stored in Convex.
- JWTs are validated server-side by Convex using the Clerk issuer domain configured in `convex/auth.config.ts`.
- All Convex queries and mutations require a valid JWT; there are no public/unauthenticated endpoints for data access (except the REST API v1 which uses API key auth).
- API keys are stored as SHA-256 hashes only — raw keys are shown once at creation and never retrievable.
- There is no `users` table in the Convex schema — user identity is derived from the Clerk JWT's `tokenIdentifier`.
- The Clerk JWT template for Convex does **not** include the `email` claim — `identity.email` is `undefined` at runtime. User emails are obtained from the Clerk frontend SDK (`useUser().primaryEmailAddress.emailAddress`) and passed as explicit arguments where needed (e.g., invite acceptance, pending invitations).
- The shared auth module (`convex/auth.ts`) centralizes all access control, replacing previously duplicated ownership checks. The role hierarchy (owner > editor > viewer) is enforced server-side.
- Chat endpoints (`/api/chat` and `/api/chat-edit`) verify vault access before building RAG context, preventing unauthorized users from querying vault notes.

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend (.env.local) | Clerk publishable key for the `<ClerkProvider>` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env vars | Clerk JWT issuer domain for backend token validation |
