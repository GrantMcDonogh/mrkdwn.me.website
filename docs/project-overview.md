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
│  │ chat.ts  │ │ http.ts  │ │ schema   │            │
│  │          │ │          │ │ .ts      │            │
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
│   │   ├── chat/                 # AI chat panel (Claude RAG)
│   │   ├── command-palette/      # Command palette & quick switcher
│   │   ├── editor/               # Markdown editor, wiki links, live preview
│   │   ├── explorer/             # File tree explorer
│   │   ├── graph/                # D3.js graph visualization
│   │   ├── layout/               # App layout, sidebar, split panes, tabs
│   │   ├── search/               # Search panel
│   │   └── vault/                # Vault selection & management
│   ├── store/
│   │   └── workspace.tsx         # Global state (Context + Reducer)
│   ├── App.tsx                   # Root component with auth gating
│   ├── main.tsx                  # Entry point with providers
│   └── index.css                 # Global styles & Tailwind theme
│
├── convex/                       # Backend serverless functions
│   ├── schema.ts                 # Database schema
│   ├── auth.config.ts            # Clerk JWT validation config
│   ├── vaults.ts                 # Vault CRUD operations
│   ├── folders.ts                # Folder management
│   ├── notes.ts                  # Note CRUD, search, backlinks
│   ├── chat.ts                   # AI chat HTTP action (Claude API)
│   ├── chatHelpers.ts            # RAG context builder (internal query)
│   ├── http.ts                   # HTTP routes (/api/chat)
│   └── _generated/               # Auto-generated API types
│
├── mcp-server/                   # MCP server for AI tool access
│   ├── src/                      # Server source (tools for vaults/folders/notes)
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                         # Project documentation
├── public/                       # Static assets
├── index.html                    # HTML entry point
├── package.json                  # Dependencies & scripts
├── vite.config.ts                # Vite build config
├── vercel.json                   # Vercel deployment config
├── tsconfig.json                 # TypeScript config (root)
├── tsconfig.app.json             # TypeScript config (app)
└── eslint.config.js              # Linting rules
```

## Data Model Overview

The application has three database tables (users are managed by Clerk):

- **Vaults** - Top-level containers owned by a user (identified by Clerk `tokenIdentifier`). All notes and folders belong to a vault.
- **Folders** - Hierarchical containers within a vault. Support unlimited nesting via self-referencing `parentId`. Have an `order` field for sorting.
- **Notes** - Markdown documents within a vault, optionally inside a folder. Support full-text search on title and content. Have `order`, `createdAt`, and `updatedAt` fields.

```
User (Clerk) 1──* Vault 1──* Folder (self-referencing parentId)
                           1──* Note
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
| Design & Styling | [design-and-styling.md](./design-and-styling.md) |
| MCP Server | [mcp-server.md](./mcp-server.md) |
