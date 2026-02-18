# Real-Time & Sync

## Overview

mrkdwn.me leverages Convex's built-in real-time subscription system to keep all connected clients in sync without manual polling, WebSocket management, or complex state synchronization logic. Combined with the editor's auto-save mechanism, this creates a seamless experience where changes are persisted and reflected across the UI immediately.

## Convex Real-Time Subscriptions

### How It Works

1. **Client subscribes**: When a React component calls `useQuery(api.notes.list, { vaultId })`, the Convex client establishes a subscription to that query with those specific arguments.

2. **Server tracks dependencies**: The Convex backend tracks which database tables and documents each query depends on.

3. **Data changes**: When a mutation modifies data (e.g., `notes.create` inserts a new note), the server identifies which active queries are affected.

4. **Push update**: The server re-runs affected queries and pushes the new results to all subscribed clients over a persistent connection.

5. **React re-renders**: The `useQuery` hook receives the updated data and triggers a re-render of the component.

### Connection Management

- Convex manages a single persistent connection per client.
- Connection is established when `ConvexReactClient` is instantiated in `main.tsx`.
- Automatic reconnection on connection loss.
- Subscriptions are cleaned up when components unmount.

### Reactive Components

| Component | Query | Reacts To |
|-----------|-------|-----------|
| `FileExplorer` | `folders.list`, `notes.list` | Folder/note create, rename, delete, move |
| `MarkdownEditor` | `notes.get` | Note content/title changes |
| `BacklinksPanel` | `notes.getBacklinks`, `notes.getUnlinkedMentions` | Any note content change in vault |
| `GraphView` | `notes.list` | Note create, delete, content changes (link changes) |
| `SearchPanel` | `notes.search`, `notes.list` | Note content/title changes |
| `TabBar` | `notes.get` (per tab) | Note title renames |
| `VaultSelector` | `vaults.list` | Vault create, rename, delete |
| `ChatPanel` | HTTP streaming (not `useQuery`) | Streams responses from `/api/chat` endpoint |

---

## Auto-Save System

**File:** `src/components/editor/MarkdownEditor.tsx`

### Flow

```
User types in editor
       │
       ▼
EditorView.updateListener fires
       │
       ▼
clearTimeout(pendingSave)
       │
       ▼
setTimeout(500ms) ──────────────────────▶ notes.update(noteId, content)
       │                                         │
       │ (user types again within 500ms)         ▼
       │                                  Server persists change
       ▼                                         │
clearTimeout(pendingSave)                        ▼
setTimeout(500ms) ──▶ ...              Subscriptions notified
```

### Debounce Strategy

- **Delay**: 500 milliseconds.
- **Behavior**: Each keystroke resets the timer. The save only fires after 500ms of inactivity.
- **Purpose**: Prevents excessive database writes during continuous typing. A user typing a paragraph triggers only one save (at the end) rather than one per character.

### Unmount Flush

When the editor component unmounts (e.g., switching tabs, closing the note):

1. Check if there is a pending save timeout.
2. If yes, clear the timeout and immediately call `notes.update` with the current content.
3. This ensures no content is lost when navigating away from a note.

### Conflict Handling

Since mrkdwn.me is single-user (no collaborative editing):

- **No merge conflicts**: Only one client writes to a note at a time.
- **Last write wins**: If the same note is open in two panes and edited simultaneously, the last save overwrites the previous one.
- **External updates**: When a note is modified externally (e.g., wiki link rename), the editor checks whether the user is actively editing:
  - If the editor is **not focused**: the content is replaced with the server version.
  - If the editor **is focused**: the update is skipped entirely (the condition `!view.hasFocus` must be true). There is no deferred application — the next save from the focused editor will overwrite the server state.

---

## Wiki Link Rename Synchronization

When a note is renamed, all references across the vault must be updated. This is handled as an atomic server-side operation:

### Sequence

```
User renames "Note A" → "Note B"
       │
       ▼
Frontend calls notes.rename({ id, title: "Note B" })
       │
       ▼
Server-side mutation:
  1. Update note title: "Note A" → "Note B"
  2. Fetch ALL notes in vault
  3. For each note:
     - Search content for [[Note A]], [[Note A|, [[Note A#
     - Replace with [[Note B]], [[Note B|, [[Note B#
     - If changed, patch the note
  4. Update timestamps
       │
       ▼
Convex detects affected queries:
  - notes.get (for the renamed note)
  - notes.list (title changed)
  - notes.get (for all notes whose content changed)
  - notes.getBacklinks (references changed)
       │
       ▼
All subscribed components re-render with updated data
```

### Atomicity

The entire rename + reference update happens in a single Convex mutation. This guarantees:

- All changes are applied together (no partial updates).
- Other queries see the complete, consistent state.
- If the mutation fails, no changes are persisted.

---

## Subscription Lifecycle

### Component Mount

```typescript
// Component subscribes to query
const notes = useQuery(api.notes.list, { vaultId });
// Convex client registers subscription with server
// Server sends initial results
// Component renders with data
```

### Data Change

```typescript
// Another component or user action triggers mutation
const createNote = useMutation(api.notes.create);
await createNote({ title: "New Note", vaultId });
// Server runs mutation → data changes
// Server re-runs affected queries
// Pushes results to subscribed clients
// useQuery hooks update → components re-render
```

### Component Unmount

```typescript
// Component unmounts (e.g., switching views)
// useQuery hook cleanup runs
// Convex client unsubscribes from query
// Server stops tracking this subscription
```

---

## Optimistic Updates

Convex supports optimistic updates, though they are not explicitly used in the current codebase. The current approach relies on:

1. **Mutations** are fast (serverless, low latency).
2. **Subscriptions** push results quickly after mutations complete.
3. The perceived delay is minimal for most operations.

For the editor, the user sees their changes immediately in the CodeMirror instance (local state). The save to the server happens asynchronously, and the subscription update confirms the persistence.

---

## Performance Characteristics

| Aspect | Behavior |
|--------|----------|
| Subscription overhead | One persistent connection per client; minimal per-query overhead |
| Update latency | Typically < 100ms from mutation to subscription update |
| Auto-save frequency | At most once per 500ms during active editing |
| Full-text search | Server-side indexed; results pushed reactively |
| Graph recomputation | Client-side on every `notes.list` update |
| Backlink computation | Server-side scan of all vault notes per query |

## Limitations

1. **Single-user model**: No multi-user collaboration or real-time co-editing.
2. **No offline support**: Requires an active connection to the Convex backend.
3. **No conflict resolution**: Last write wins for concurrent edits to the same note.
4. **Backlink performance**: Scales linearly with vault size (scans all notes).
5. **No delta updates**: Full query results are pushed, not incremental diffs.
