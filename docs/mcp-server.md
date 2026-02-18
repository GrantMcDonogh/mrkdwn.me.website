# MCP Server

## Overview

The MCP (Model Context Protocol) server exposes mrkdwn.me vault data as tools that LLMs can call directly. This allows Claude Code, Claude Desktop, and other MCP-compatible clients to read, create, search, and manage notes and folders programmatically.

## Architecture

The MCP server is a separate Node.js service that communicates via stdio transport. It uses the `ConvexHttpClient` to call existing Convex queries and mutations — no separate API layer is needed.

```
MCP Client (Claude Code / Claude Desktop)
  |
  | stdio (JSON-RPC)
  |
  v
MCP Server (Node.js process)
  |
  | ConvexHttpClient
  |
  v
Convex Backend (existing queries/mutations)
```

### Key Design Decisions

- **Stdio transport**: The server runs as a subprocess of the MCP client. No HTTP server or port management needed.
- **Reuses Convex functions**: All data access goes through the same queries and mutations used by the web app. No duplicate logic.
- **Auth via env var**: The server authenticates as a specific user via a Convex auth token stored in an environment variable.

## Directory Structure

```
mcp-server/
+-- package.json
+-- tsconfig.json
+-- src/
    +-- index.ts           # Entry point, MCP server setup, stdio transport
    +-- convex-client.ts   # ConvexHttpClient initialization
    +-- tools/
        +-- vaults.ts      # Vault tools
        +-- folders.ts     # Folder tools
        +-- notes.ts       # Note tools
```

## Tools

### Vault Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_vaults` | List all vaults for the authenticated user | None |
| `get_vault` | Get a vault by ID | `vaultId` |

### Folder Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_folders` | List all folders in a vault | `vaultId` |
| `create_folder` | Create a new folder | `name`, `vaultId`, `parentId?` |
| `rename_folder` | Rename a folder | `folderId`, `name` |
| `move_folder` | Move a folder to a new parent | `folderId`, `parentId?` |
| `delete_folder` | Delete a folder (children promoted) | `folderId` |

### Note Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_notes` | List all notes in a vault (returns summary: `_id`, `title`, `folderId`, `updatedAt` — no content) | `vaultId` |
| `get_note` | Get a note's full content | `noteId` |
| `create_note` | Create a new note | `title`, `vaultId`, `folderId?` |
| `update_note` | Update a note's content | `noteId`, `content` |
| `rename_note` | Rename a note (updates wiki links) | `noteId`, `title` |
| `move_note` | Move a note to a folder | `noteId`, `folderId?` |
| `delete_note` | Delete a note | `noteId` |
| `search_notes` | Full-text search across vault notes (returns `_id`, `title`, and first 200 chars of content as preview) | `vaultId`, `query` |
| `get_backlinks` | Get notes that link to a given note | `noteId` |
| `get_unlinked_mentions` | Get notes that mention a note's title without linking | `noteId` |

## Authentication

The MCP server authenticates as a specific user using a Convex auth token:

1. The user generates or retrieves their Convex auth token (a Clerk JWT).
2. The token is set as the `CONVEX_AUTH_TOKEN` environment variable.
3. On startup, `convex-client.ts` creates a `ConvexHttpClient` and calls `client.setAuth(authToken)` if the token is present.
4. All subsequent Convex queries and mutations include this token, allowing `ctx.auth.getUserIdentity()` to resolve the user.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CONVEX_URL` | Convex deployment URL |
| `CONVEX_AUTH_TOKEN` | Auth token for the user |

## Setup

### For Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "mrkdwn": {
      "command": "node",
      "args": ["path/to/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "CONVEX_AUTH_TOKEN": "your-token"
      }
    }
  }
}
```

### For Claude Desktop

Add to Claude Desktop's MCP configuration:

```json
{
  "mcpServers": {
    "mrkdwn": {
      "command": "node",
      "args": ["path/to/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "CONVEX_AUTH_TOKEN": "your-token"
      }
    }
  }
}
```

## Build & Run

```bash
cd mcp-server
npm install
npm run build    # tsc -> dist/
npm run dev      # tsc --watch (for development)
npm start        # node dist/index.js (stdio)
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | `^1.12.1` | MCP protocol server implementation |
| `convex` | `^1.31.7` | Convex HTTP client for backend access |
| `typescript` | `^5.9.3` | TypeScript compiler (dev) |
