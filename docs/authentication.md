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
- The only HTTP routes are for the `/api/chat` AI streaming endpoint.

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
export default function App() {
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
```

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

### Data Isolation

- **Vaults** are filtered by `userId` (the Clerk `tokenIdentifier`) — users can only see and modify their own vaults.
- **Folders and Notes** are accessed through vaults, inheriting the vault's ownership check via a `verifyVaultOwnership()` helper.
- There is no shared/collaborative access model — each user's data is fully isolated.

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

## Security Considerations

- User accounts and credentials are managed entirely by Clerk's hosted infrastructure — no sensitive auth data is stored in Convex.
- JWTs are validated server-side by Convex using the Clerk issuer domain configured in `convex/auth.config.ts`.
- All Convex queries and mutations require a valid JWT; there are no public/unauthenticated endpoints for data access.
- There is no `users` table in the Convex schema — user identity is derived from the Clerk JWT's `tokenIdentifier`.

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend (.env.local) | Clerk publishable key for the `<ClerkProvider>` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env vars | Clerk JWT issuer domain for backend token validation |
