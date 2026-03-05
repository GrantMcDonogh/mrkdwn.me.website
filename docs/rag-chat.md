# RAG Chat

## Overview

The RAG (Retrieval-Augmented Generation) chat panel allows users to ask questions about their vault content and receive AI-generated answers grounded in their notes. It appears as a right panel in the app layout, streaming responses via Convex httpActions.

The chat supports two modes:

1. **Q&A Mode** (default) — Read-only question answering powered by the Anthropic API (Claude). Always available.
2. **Edit Mode** — Question answering plus the ability to edit and create notes, powered by OpenRouter. Requires the user to configure an OpenRouter API key via the Settings dialog.

## Architecture

### Q&A Mode

```
Client (ChatPanel)
  |
  | POST /api/chat
  | Authorization: Bearer <convex-token>
  | Body: { vaultId, message }
  |
  v
Convex httpAction (convex/chat.ts)
  |
  | 1. Authenticate via ctx.auth.getUserIdentity()
  | 2. Validate request body (vaultId, message)
  | 3. Verify vault access (viewer role minimum) via auth.checkVaultAccess
  | 4. Build context via chatHelpers.buildContext (internal query)
  | 5. Call Anthropic API (claude-sonnet-4-5-20250929) with stream: true
  | 6. Stream response via TransformStream
  |
  v
TransformStream → streamed response back to client
```

### Edit Mode

```
Client (ChatPanel)
  |
  | POST /api/chat-edit
  | Authorization: Bearer <convex-token>
  | Body: { vaultId, message, activeNoteId? }
  |
  v
Convex httpAction (convex/chatEdit.ts)
  |
  | 1. Authenticate via ctx.auth.getUserIdentity()
  | 2. Verify vault access (editor role minimum) via auth.checkVaultAccess
  | 3. Retrieve user's OpenRouter key via userSettings.getOpenRouterKey
  | 4. Build context via chatEditHelpers.buildEditContext (includes active note)
  | 5. Call OpenRouter API (anthropic/claude-sonnet-4) with stream: true
  | 6. Stream response via TransformStream
  |
  v
TransformStream → streamed response back to client
  |
  v
Client parses edit/create blocks → renders EditBlockCard with DiffView
```

### Why httpAction?

Convex queries and mutations don't support streaming responses. The chat endpoints use `httpAction` which can return arbitrary HTTP responses, including streaming via `TransformStream`. Authentication uses the built-in `ctx.auth.getUserIdentity()` which validates the Clerk JWT passed in the `Authorization` header.

### Context Building

**Q&A mode:** Context is built by `convex/chatHelpers.ts`, an `internalQuery` called `buildContext`. It performs a dual-index search (title + content, 15 results each), merges and deduplicates, then builds a two-tier context string. If no search results match, it falls back to fetching 15 notes by the `by_vault` index.

**Edit mode:** Context is built by `convex/chatEditHelpers.ts`, an `internalQuery` called `buildEditContext`. It follows the same dual-index search pattern but additionally accepts an `activeNoteId` parameter. When provided, the active note's full content is included first (labelled as "ACTIVE NOTE") before adding search results. The active note is excluded from search results to avoid duplication.

Both endpoints verify vault access before building context. Q&A mode requires at least **viewer** access; edit mode requires at least **editor** access. This prevents unauthorized users from querying vault notes via the chat API.

## Context Building

The context builder uses a two-tier approach to maximize relevance within the token budget:

### Tier 1: Full Content (Top 5 Notes)

- Notes are selected by searching the vault using the user's question as a query.
- The top 5 results include their full markdown content.
- These provide Claude with detailed information to answer from.

### Tier 2: Title Only (Next 10 Notes)

- The next 10 search results include only their title.
- These give Claude awareness of related notes without consuming the context budget.

### Budget

- Total context is capped at **80,000 characters**.
- Notes are added in relevance order until the cap is reached.
- Blocks are separated by `---` markers.

## API Endpoints

### `POST /api/chat` (Q&A Mode)

**Headers:**
- `Authorization: Bearer <convex-auth-token>` — Required

**Request Body:**
```json
{
  "vaultId": "<vault-id>",
  "message": "What are the key points from my project notes?"
}
```

**Response:** Streamed plain text (content-type: `text/plain; charset=utf-8`). Tokens arrive as they are generated.

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid user identity |
| 400 | Missing `vaultId` or `message` in request body |
| 403 | User lacks viewer access to the vault, or `buildContext` returned null |
| 500 | `ANTHROPIC_API_KEY` env var not set |
| 502 | Claude API returned a non-OK response |

### `POST /api/chat-edit` (Edit Mode)

**Headers:**
- `Authorization: Bearer <convex-auth-token>` — Required

**Request Body:**
```json
{
  "vaultId": "<vault-id>",
  "message": "Add a summary section to my project notes",
  "activeNoteId": "<note-id>"  // optional, the currently open note
}
```

**Response:** Streamed plain text. May contain edit/create blocks (see Edit Block Syntax below).

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid user identity |
| 400 | Missing `vaultId` or `message`, OpenRouter API key not configured, or OpenRouter API returned a non-OK response (JSON body: `{ error: "..." }`) |
| 403 | User lacks editor access to the vault, or `buildEditContext` returned null |
| 500 | Server error |

### CORS

Both endpoints echo the request's `Origin` header in `Access-Control-Allow-Origin` (with `Vary: origin`) and handle OPTIONS preflight requests.

## System Prompts

### Q&A Mode

The system prompt instructs Claude to:

- Answer **only** from the provided vault notes
- Use `[[Note Title]]` wiki link syntax when referencing note titles (rendered as clickable links in the chat UI)
- Say "I don't have enough information in your notes to answer that" when context is insufficient
- Note discrepancies between notes
- Use markdown formatting in responses
- Be concise and factual

### Edit Mode

The system prompt instructs the AI to:

- Answer questions about vault notes, using `[[Note Title]]` wiki link syntax when referencing note titles
- Edit existing notes when asked, using `````edit:Note Title` blocks
- Create new notes when asked, using `````create:New Note Title` blocks
- Output **complete replacement content** (not partial diffs) inside edit blocks
- Explain changes in natural language before the edit/create block
- Preserve parts of notes the user didn't ask to change
- Use `[[Wiki Link]]` syntax to link between notes in note content

## Edit Block Syntax

When the AI edits or creates notes in edit mode, it outputs fenced blocks:

```
````edit:Note Title
...full new content of the note...
````

````create:New Note Title
...content of the new note...
````
```

These blocks are parsed client-side by `parseEditBlocks()` (`src/lib/parseEditBlocks.ts`) which extracts the type (`edit` or `create`), note title, and content using a regex. The `stripEditBlocks()` function removes these blocks from the displayed message text so the user sees only the natural language explanation.

## Frontend

### ChatPanel

**File:** `src/components/chat/ChatPanel.tsx`

Displayed in the right panel when `rightPanel === "chat"`.

#### UI Structure

```
Chat Panel
+-- Header
|   +-- "Chat" label
|   +-- "Edit mode" badge (shown when OpenRouter key is configured)
|   +-- Clear chat button (Trash2 icon, shown when messages exist)
|   +-- Settings button (Settings icon, opens SettingsDialog)
+-- Message List (scrollable)
|   +-- User Message
|   +-- Assistant Message (streaming)
|   |   +-- EditBlockCard(s) (if edit mode, after streaming completes)
|   +-- ...
+-- Input Area
    +-- Text input + Send button
```

#### Features

| Feature | Description |
|---------|-------------|
| Message history | Displays conversation in the current session |
| Streaming display | Assistant responses appear token-by-token |
| Auto-scroll | Scrolls to bottom as new tokens arrive |
| Send on Enter | Enter key sends the message |
| Loading state | Disabled input while waiting for response |
| Edit mode badge | Purple "Edit mode" badge shown when OpenRouter key is configured |
| Clear chat | Trash icon to clear all messages |
| Settings access | Settings gear icon opens the SettingsDialog |

#### Mode Selection

The chat panel automatically selects the endpoint based on the user's OpenRouter key status:

- **No key configured** → Q&A mode (`/api/chat`), placeholder: "Ask about your notes..."
- **Key configured** → Edit mode (`/api/chat-edit`), placeholder: "Ask about or edit your notes...", active note ID is passed to the backend
- **Viewer role** → Edit mode toggle is hidden regardless of OpenRouter key status. Viewers can only use Q&A mode.

### ChatMessage

**File:** `src/components/chat/ChatMessage.tsx`

Renders individual user or assistant messages with appropriate styling.

**User messages** are rendered as plain text with `whitespace-pre-wrap`.

**Assistant messages** are rendered as formatted markdown via `ReactMarkdown` + `remarkGfm`:

- Content is preprocessed by `preprocessContent()` (from `src/utils/preprocessMarkdown.ts`) which converts `[[Wiki Link]]` syntax to clickable internal links and `#tags` to styled spans — the same utility used by the note preview.
- The custom `components.a` handler intercepts `wikilink://` URLs and navigates to the linked note (case-insensitive title match) via the `onNavigateNote` callback. Regular URLs open in a new tab.
- The wrapper div uses both `chat-message-markdown` and `markdown-preview` CSS classes — `markdown-preview` provides the base markdown styles, `chat-message-markdown` overrides font sizes for the smaller chat panel.
- Edit blocks are stripped from the displayed text (via `stripEditBlocks`) and each parsed `EditBlock` is rendered as an `EditBlockCard` below the message.

### EditBlockCard

**File:** `src/components/chat/EditBlockCard.tsx`

Renders an interactive card for each edit/create block proposed by the AI:

| Element | Description |
|---------|-------------|
| Header | Icon (Pencil for edit, FilePlus for create) + note title + status badge |
| DiffView | Line-by-line diff comparing original content vs proposed changes |
| Error | Warning if the target note is not found in the vault |
| Actions | "Apply Changes" and "Dismiss" buttons (hidden after resolution) |

**Apply logic:**
- **Edit**: Finds the note by title (case-insensitive), calls `notes.update` with the new content
- **Create**: Calls `notes.create` then `notes.update` with content, opens the new note via `OPEN_NOTE` dispatch

**Status flow:** `pending` → `applied` or `dismissed`

### DiffView

**File:** `src/components/chat/DiffView.tsx`

Renders a line-by-line diff between original and proposed content using the `diff` package (`diffLines`). Added lines are green, removed lines are red with strikethrough, and unchanged lines are muted.

### useChatStream

**File:** `src/components/chat/useChatStream.ts`

Custom hook that manages the streaming fetch lifecycle:

1. Sends POST request to `/api/chat` or `/api/chat-edit` based on `options.useEditEndpoint`.
2. For edit mode, includes `activeNoteId` in the request body.
3. On error responses, attempts to parse JSON body (`{ error: "..." }`) for a clean error message, falling back to plain text.
4. Reads the response body as a stream via `ReadableStream`.
5. Decodes chunks and appends to the current assistant message.
6. After streaming completes in edit mode, parses edit blocks via `parseEditBlocks()`.
7. Exposes `updateBlockStatus(messageIndex, blockIndex, status)` for tracking apply/dismiss state.

### SettingsDialog

**File:** `src/components/settings/SettingsDialog.tsx`

Modal dialog for managing user settings, accessible from the chat panel header (Settings icon) or the command palette ("Open Settings").

#### Features

- **View key status**: Shows masked key (`sk-or-••••••••`) when configured
- **Test key**: "Test" button validates the key against OpenRouter's free `GET /api/v1/auth/key` endpoint via the `/api/test-openrouter-key` backend route. Shows green "Key is valid" on success or a red error message on failure. Test status resets when the input changes.
- **Save key**: Text input with "Save" button, validates non-empty
- **Replace key**: Enter a new key when one already exists
- **Remove key**: "Remove" button to delete the stored key
- **External link**: Link to [openrouter.ai/keys](https://openrouter.ai/keys) to obtain a key
- **Status feedback**: Success ("Key saved successfully") and error messages

## Workspace Integration

The workspace state's `rightPanel` union type includes `"chat"`:

```typescript
rightPanel: "backlinks" | "graph" | "search" | "chat" | null;
```

The chat panel is toggled via a toolbar button (MessageSquare icon) or the command palette.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | Convex env vars | API key for Claude API calls (Q&A mode) |

The OpenRouter API key for edit mode is stored per-user in the `userSettings` database table (not as an environment variable). Users configure it via the Settings dialog.

## File Summary

| File | Purpose |
|------|---------|
| `convex/chat.ts` | Q&A mode HTTP action (Anthropic API) |
| `convex/chatHelpers.ts` | Q&A context builder (internal query) |
| `convex/chatEdit.ts` | Edit mode HTTP action (OpenRouter API) |
| `convex/chatEditHelpers.ts` | Edit mode context builder with active note |
| `convex/testKey.ts` | OpenRouter API key validation endpoint |
| `convex/userSettings.ts` | OpenRouter key CRUD operations |
| `src/components/chat/ChatPanel.tsx` | Chat panel UI with mode switching |
| `src/components/chat/ChatMessage.tsx` | Message rendering with markdown + wiki link support |
| `src/utils/preprocessMarkdown.ts` | Shared utility converting `[[wiki links]]` and `#tags` to markdown links |
| `src/components/chat/EditBlockCard.tsx` | Interactive edit/create block card |
| `src/components/chat/DiffView.tsx` | Line-by-line diff viewer |
| `src/components/chat/useChatStream.ts` | Streaming fetch hook with edit block parsing |
| `src/components/settings/SettingsDialog.tsx` | Settings modal for API key management |
| `src/lib/parseEditBlocks.ts` | Edit block parser and stripper |
