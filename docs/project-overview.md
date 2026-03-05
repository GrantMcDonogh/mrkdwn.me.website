# mrkdwn.me - Project Overview

## Summary

mrkdwn.me is a cloud-based knowledge management system inspired by [Obsidian](https://obsidian.md). It enables users to create, organize, and interlink Markdown notes in a real-time web application with features like wiki-style linking, a graph view of note relationships, backlinks, full-text search, and a command palette.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 19.2.0 |
| Language | TypeScript | 5.9.3 |
| Build Tool | Vite | 7.3.1 |
| Styling | Tailwind CSS | 4.1.18 |
| Routing | React Router DOM | 7.13.0 |
| Backend / Database | Convex | 1.31.7 |
| Authentication | @clerk/clerk-react | ^5.25.3 |
| Editor | CodeMirror 6 | 6.x (multiple packages) |
| Graph Visualization | D3.js | 7.9.0 |
| Markdown Rendering | react-markdown + remark-gfm | latest |
| ZIP Generation | JSZip | latest |
| Icons | lucide-react | 0.574.0 |

## Architecture

The application follows a **client-server architecture** with Convex as the serverless backend:

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  Auth     │ │  Vault   │ │  App     │            │
│  │  Page     │ │  Selector│ │  Layout  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                 │                   │
│        ┌────────────────────────┼──────────┐        │
│        │          │             │          │        │
│  ┌─────┴──┐ ┌────┴───┐ ┌──────┴──┐ ┌─────┴──┐    │
│  │Sidebar │ │ Editor │ │ Right   │ │ Tab    │    │
│  │Explorer│ │ Panes  │ │ Panels  │ │ Bar    │    │
│  └────────┘ └────────┘ └─────────┘ └────────┘    │
│                                                     │
│  State Management: React Context + useReducer       │
│  Server State: Convex useQuery / useMutation        │
└──────────────────┬──────────────────────────────────┘
                   │ Real-time subscriptions
                   │ Mutations / Queries
┌──────────────────▼──────────────────────────────────┐
│                 Backend (Convex Cloud)               │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ vaults   │ │ folders  │ │ notes    │            │
│  │ .ts      │ │ .ts      │ │ .ts      │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ chat.ts  │ │chatEdit  │ │onboarding│            │
│  │          │ │ .ts      │ │ .ts      │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │userSett- │ │ http.ts  │ │ schema   │            │
│  │ ings.ts  │ │          │ │ .ts      │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                     │
│  Database: Convex (document-based, indexed)          │
│  Auth: Clerk (JWT validation)                        │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
mrkdwn-me/
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── auth/                 # Authentication UI (Clerk SignIn)
│   │   ├── backlinks/            # Backlinks panel
│   │   ├── chat/                 # AI chat panel (RAG Q&A + edit mode)
│   │   ├── command-palette/      # Command palette & quick switcher
│   │   ├── docs/                 # Public API documentation page
│   │   ├── editor/               # Markdown editor, preview, wiki links, live preview, version history
│   │   ├── explorer/             # File tree explorer
│   │   ├── trash/                # Trash panel (soft-deleted items)
│   │   ├── graph/                # D3.js graph visualization
│   │   ├── layout/               # App layout, sidebar, split panes, tabs
│   │   ├── search/               # Search panel
│   │   ├── settings/             # Settings dialog (OpenRouter key, vault API keys)
│   │   └── vault/                # Vault selection, management, sharing, onboarding & audit log
│   ├── hooks/
│   │   ├── useDownloadVault.ts   # Vault download hook
│   │   ├── useExportNotePDF.ts   # Single-note PDF export hook
│   │   ├── useOnboardingGenerate.ts # AI onboarding stream hook
│   │   └── useVaultRole.ts       # Permission derivation hook for sharing
│   ├── utils/
│   │   ├── downloadVault.ts      # ZIP building utility
│   │   └── exportNoteToPDF.ts    # PDF export utility
│   ├── store/
│   │   └── workspace.tsx         # Global state (Context + Reducer)
│   ├── App.tsx                   # Root component with auth gating + /docs route
│   ├── main.tsx                  # Entry point with providers
│   └── index.css                 # Global styles & Tailwind theme
│
├── convex/                       # Backend serverless functions
│   ├── schema.ts                 # Database schema
│   ├── auth.config.ts            # Clerk JWT validation config
│   ├── auth.ts                   # Shared auth module (role-based access control)
│   ├── vaults.ts                 # Vault CRUD operations
│   ├── folders.ts                # Folder management
│   ├── notes.ts                  # Note CRUD, search, backlinks
│   ├── auditLog.ts               # Audit log helper + queries
│   ├── noteVersions.ts           # Version snapshot helper + queries + restore
│   ├── trash.ts                  # Trash queries, restore, permanent delete, purge
│   ├── crons.ts                  # Daily cron for 5-year trash purge
│   ├── sharing.ts                # Vault sharing (invite, accept, list, remove)
│   ├── apiKeys.ts                # Vault API key CRUD + internal validation
│   ├── internalApi.ts            # Auth-free internal queries/mutations for REST API
│   ├── apiHelpers.ts             # HTTP action wrappers (apiAction, apiKeyAction)
│   ├── apiVaults.ts              # REST API v1 vault endpoint
│   ├── apiFolders.ts             # REST API v1 folder endpoints
│   ├── apiNotes.ts               # REST API v1 note endpoints
│   ├── chat.ts                   # AI chat HTTP action (Claude API, Q&A mode)
│   ├── chatHelpers.ts            # RAG context builder (internal query)
│   ├── chatEdit.ts               # AI chat HTTP action (OpenRouter, edit mode)
│   ├── chatEditHelpers.ts        # Edit-mode context builder with active note
│   ├── onboarding.ts             # AI onboarding wizard HTTP action
│   ├── userSettings.ts           # User settings (OpenRouter key) CRUD
│   ├── testKey.ts                # OpenRouter API key validation HTTP action
│   ├── http.ts                   # HTTP routes (chat, REST API v1, onboarding)
│   └── _generated/               # Auto-generated API types
│
├── mcp-server/                   # MCP server for AI tool access
│   ├── src/
│   │   ├── index.ts              # Entry point, MCP server setup, stdio transport
│   │   ├── api-client.ts         # Fetch-based REST API client
│   │   └── tools/                # Tool definitions (vaults, folders, notes)
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                         # Project documentation
├── public/                       # Static assets (favicon.svg, apple-touch-icon.png)
├── index.html                    # HTML entry point
├── package.json                  # Dependencies & scripts
├── vite.config.ts                # Vite build config
├── vercel.json                   # Vercel deployment config
├── tsconfig.json                 # TypeScript config (root)
├── tsconfig.app.json             # TypeScript config (app)
└── eslint.config.js              # Linting rules
```

## Data Model Overview

The application has eight database tables (users are managed by Clerk):

- **Vaults** - Top-level containers owned by a user (identified by Clerk `tokenIdentifier`). All notes and folders belong to a vault.
- **Folders** - Hierarchical containers within a vault. Support unlimited nesting via self-referencing `parentId`. Have an `order` field for sorting. Support soft deletion with `isDeleted`, `deletedAt`, `deletedBy` fields.
- **Notes** - Markdown documents within a vault, optionally inside a folder. Support full-text search on title and content. Have `order`, `createdAt`, `updatedAt`, and `updatedBy` fields. Support soft deletion with `isDeleted`, `deletedAt`, `deletedBy` fields.
- **Vault Members** - Sharing memberships linking users to vaults with a role (editor or viewer). Owner role is implicit from `vaults.userId`. Supports email-based invitations with pending/accepted status.
- **User Settings** - Per-user configuration (OpenRouter API key for chat edit mode). Keyed by Clerk `tokenIdentifier`.
- **API Keys** - Vault-scoped API keys for the REST API and MCP server. Only the SHA-256 hash is stored; the raw key is shown once at creation.
- **Audit Log** - Records every action (create, update, rename, move, delete, restore, permanent delete) with user attribution. Indexed by vault and target.
- **Note Versions** - Point-in-time content snapshots of notes. Throttled to max 1 per 5 min on content edits; always created on rename, move, and delete.

```
User (Clerk) 1──* Vault 1──* Folder (self-referencing parentId)
                       | 1──* Note 1──* NoteVersion
                       | 1──* VaultMember (sharing)
                       | 1──* ApiKey
                       | 1──* AuditLog
             1──1 UserSettings
```

## Key Design Decisions

1. **Convex as Backend**: Provides real-time subscriptions out of the box, eliminating the need for manual WebSocket management. Queries automatically re-run when underlying data changes.

2. **CodeMirror 6 for Editing**: Chosen for its extensible architecture, first-class TypeScript support, and plugin ecosystem. Custom plugins implement wiki links and live preview.

3. **React Context + useReducer for State**: The workspace state (active vault, open panes/tabs, sidebar, panels) is managed with React's built-in Context API and `useReducer` pattern, avoiding external state management dependencies.

4. **D3.js Force Simulation for Graph**: Provides an interactive, physics-based network visualization of note relationships without heavy graph library dependencies.

5. **Dark Theme by Default**: The entire UI follows an Obsidian-inspired dark color palette defined as Tailwind CSS custom properties.

## Development

```bash
# Install dependencies
npm install

# Start frontend dev server
npm run dev

# Start Convex backend (in separate terminal)
npm run dev:backend

# Build for production
npm run build

# Lint
npm run lint
```

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `CONVEX_DEPLOYMENT` | .env.local | Convex deployment identifier |
| `VITE_CONVEX_URL` | .env.local | Convex backend API URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | .env.local | Clerk publishable key for frontend auth |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env vars | Clerk JWT issuer domain for backend validation |
| `ANTHROPIC_API_KEY` | Convex env vars | API key for Claude AI chat feature |

## Feature Index

| Feature | Spec Document |
|---------|--------------|
| Authentication | [authentication.md](./authentication.md) |
| Vault Management | [vault-system.md](./vault-system.md) |
| File Explorer | [file-explorer.md](./file-explorer.md) |
| Markdown Editor | [markdown-editor.md](./markdown-editor.md) |
| Wiki Links & Backlinks | [wiki-links-and-backlinks.md](./wiki-links-and-backlinks.md) |
| Graph View | [graph-view.md](./graph-view.md) |
| Search & Command Palette | [search-and-command-palette.md](./search-and-command-palette.md) |
| Workspace & Layout | [workspace-and-layout.md](./workspace-and-layout.md) |
| Database & API | [database-and-api.md](./database-and-api.md) |
| Real-Time & Sync | [real-time-and-sync.md](./real-time-and-sync.md) |
| AI Chat (RAG) | [rag-chat.md](./rag-chat.md) |
| Import Vault & Upload | [import-vault.md](./import-vault.md) |
| Download, Export & PDF | [download-vault.md](./download-vault.md) |
| Design & Styling | [design-and-styling.md](./design-and-styling.md) |
| MCP Server | [mcp-server.md](./mcp-server.md) |
| Audit Log, Version History & Trash | [audit-log-version-history-trash.md](./audit-log-version-history-trash.md) |
