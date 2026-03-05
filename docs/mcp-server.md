# MCP Server

## Overview

The MCP (Model Context Protocol) server exposes mrkdwn.me vault data as tools that LLMs can call directly. This allows Claude Code, Claude Desktop, and other MCP-compatible clients to read, create, search, and manage notes and folders programmatically.

Each MCP server instance is configured with a vault-scoped API key, granting access to exactly one vault.

## Architecture

The MCP server is a separate Node.js service that communicates via stdio transport. It uses a fetch-based REST API client to call the public REST API v1 endpoints — no Convex SDK dependency.

```
MCP Client (Claude Code / Claude Desktop)
  |
  | stdio (JSON-RPC)
  |
  v
MCP Server (Node.js process)
  |
  | HTTP (fetch) with Bearer mk_... auth
  |
  v
Convex httpActions (REST API v1)
  |
  | internal queries/mutations
  |
  v
Convex Database
```

### Key Design Decisions

- **Stdio transport**: The server runs as a subprocess of the MCP client. No HTTP server or port management needed.
- **REST API client**: All data access goes through the public REST API v1, authenticated with a vault-scoped API key. No Convex SDK or Clerk JWT needed.
- **Vault-scoped**: Each API key is bound to a single vault. The server cannot list or access other vaults.

## Directory Structure

```
mcp-server/
+-- package.json
+-- tsconfig.json
+-- src/
    +-- index.ts           # Entry point, MCP server setup, stdio transport
    +-- api-client.ts      # Fetch-based REST API client
    +-- tools/
        +-- vaults.ts      # Vault tool
        +-- folders.ts     # Folder tools
        +-- notes.ts       # Note tools
```

## Tools

### Vault Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_vault` | Get info about the vault this API key is scoped to | None |

### Folder Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_folders` | List all folders in the vault | None |
| `create_folder` | Create a new folder | `name`, `parentId?` |
| `rename_folder` | Rename a folder | `folderId`, `name` |
| `move_folder` | Move a folder to a new parent | `folderId`, `parentId?` |
| `delete_folder` | Delete a folder (children promoted) | `folderId` |

### Note Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_notes` | List all notes in the vault (returns summary: `_id`, `title`, `folderId`, `updatedAt` — no content) | None |
| `get_note` | Get a note's full content | `noteId` |
| `create_note` | Create a new note | `title`, `folderId?` |
| `update_note` | Update a note's content | `noteId`, `content` |
| `rename_note` | Rename a note (updates wiki links) | `noteId`, `title` |
| `move_note` | Move a note to a folder | `noteId`, `folderId?` |
| `delete_note` | Delete a note | `noteId` |
| `search_notes` | Full-text search across vault notes (returns `_id`, `title`, and first 200 chars of content as preview) | `query` |
| `get_backlinks` | Get notes that link to a given note | `noteId` |
| `get_unlinked_mentions` | Get notes that mention a note's title without linking | `noteId` |

## Authentication

The MCP server authenticates using a vault-scoped API key:

1. In the mrkdwn.me web app, open Settings and create an API key for the target vault.
2. Copy the key (shown once, starts with `mk_`).
3. Set it as the `MRKDWN_API_KEY` environment variable.
4. All REST API requests include the key as `Authorization: Bearer mk_...`.
5. The backend hashes the key with SHA-256 and looks it up in the `apiKeys` table.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MRKDWN_API_URL` | Convex site URL (e.g. `https://beaming-panda-407.convex.site`) |
| `MRKDWN_API_KEY` | Vault-scoped API key (starts with `mk_`) |

## Setup

### For Claude Code

Add to `.claude/settings.json` (project or global):

```json
{
  "mcpServers": {
    "mrkdwn": {
      "command": "node",
      "args": ["path/to/mcp-server/dist/index.js"],
      "env": {
        "MRKDWN_API_URL": "https://beaming-panda-407.convex.site",
        "MRKDWN_API_KEY": "mk_your_api_key_here"
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
        "MRKDWN_API_URL": "https://beaming-panda-407.convex.site",
        "MRKDWN_API_KEY": "mk_your_api_key_here"
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
| `zod` | (transitive) | Schema validation for MCP tool parameters |
| `@types/node` | `^25.3.0` | Node.js type definitions (dev) |
| `typescript` | `^5.9.3` | TypeScript compiler (dev) |
