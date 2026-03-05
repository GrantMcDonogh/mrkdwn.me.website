# Wiki Links & Backlinks

## Overview

Wiki links are the primary mechanism for connecting notes in mrkdwn.me. They use the `[[Note Title]]` syntax to create navigable links between notes. The backlinks feature surfaces all notes that link to a given note, enabling bidirectional knowledge navigation.

## Wiki Link Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `[[Title]]` | Basic link to a note | `[[Meeting Notes]]` |
| `[[Title\|Alias]]` | Link with display alias | `[[Meeting Notes\|notes]]` |
| `[[Title#Heading]]` | Link to a specific heading | `[[Meeting Notes#Action Items]]` |

## Wiki Link Plugin

**File:** `src/components/editor/wikiLinks.ts`

### Detection & Parsing

The wiki link plugin uses CodeMirror's `ViewPlugin` to detect `[[...]]` patterns in the editor content:

1. A regex (`/\[\[([^\]]+)\]\]/g`) scans the visible content for `[[...]]` patterns.
2. Each match is parsed to extract:
   - **Title**: The target note name (before `|` or `#`).
   - **Alias**: Optional display text (after `|`).
   - **Heading**: Optional section reference (after `#`).
3. Decorations are created for each detected wiki link.

### Rendering

Wiki links are rendered using **replacement widgets** (`WikiLinkWidget extends WidgetType`). The raw `[[...]]` syntax is replaced in the editor view by a `<span>` element via `Decoration.replace()`:

- **Color**: `var(--color-obsidian-link)` (currently `#7f6df2`)
- **Style**: No underline by default (`text-decoration: none`); underline on hover only
- **Cursor**: Pointer cursor
- **Content**: Shows the alias if present (from `|`), otherwise the full inner text (including `#heading` if present)
- **Click handler**: Each widget has a click listener that calls the injected `navigateToNote` callback

### Navigation

When a user clicks a wiki link:

1. The widget's click handler calls the `navigateToNote(title)` callback.
2. It searches the current vault's notes for a matching title (case-insensitive via `.toLowerCase()`).
3. If found, it dispatches `OPEN_NOTE` to the workspace context, opening the linked note in the current pane. If not found, the click is silently ignored (no error, no new note creation).
4. Two callbacks are injected by the `MarkdownEditor` component at mount time:
   - `setWikiLinkNavigator()` — for click navigation
   - `setNoteListProvider()` — for autocomplete (provides the in-memory note list synchronously)

### Autocomplete

**Trigger**: Typing `[[` in the editor activates the wiki link autocomplete.

**Behavior**:

1. The autocomplete extension monitors for the `[[` trigger via regex `/\[\[\w*/`. **Note:** This regex only matches word characters (`[a-zA-Z0-9_]`) after `[[`, so autocomplete stops working if a space or special character is typed.
2. On trigger, it calls the injected `getNoteList()` provider synchronously (no network request — the note list is already in memory).
3. Notes are filtered by case-insensitive substring matching (`.toLowerCase().includes(query)`).
4. Results are displayed in a dropdown list.
5. Selecting a result applies `${n.title}]]` starting from after the `[[` prefix, producing the complete `[[Note Title]]`.

**Implementation**: Uses `@codemirror/autocomplete` with a custom completion source registered for the `[[` context.

## Link Preview Popup

Hovering over a wiki link shows a popup with rendered markdown content of the linked note, allowing users to peek at linked notes without navigating away.

### Editor Mode (CodeMirror)

**File:** `src/components/editor/wikiLinks.ts`

Uses a custom `ViewPlugin` that manages its own `position: fixed` DOM element appended to `document.body`, bypassing CodeMirror's built-in tooltip system for full control over positioning:

1. A `mousemove` listener on the editor DOM calls `posAtCoords()` to map the mouse position to a document offset, then scans the line for `[[...]]` matches.
2. If the cursor is over a wiki link, a 300ms timer starts. When it fires, the popup is created and appended to `document.body`.
3. The linked note's content is retrieved via the injected `getNoteContent(title)` callback.
4. Content is truncated to 1500 characters, wiki links are stripped to plain text via `preprocessForPDF()`, and HTML is rendered synchronously via `marked.parse()`.
5. The popup is positioned at the mouse cursor using `positionPopup()` with smart viewport edge detection (see Positioning below).
6. On `mouseleave` from the editor, a 200ms dismiss timer starts. The popup's own `mouseenter` cancels the dismiss; `mouseleave` from the popup triggers dismissal.
7. On plugin `destroy()`, all timers are cleared and the popup is removed.

The content provider is injected by `MarkdownEditor` via `setNoteContentProvider()`, following the same module-level callback pattern as `setWikiLinkNavigator` and `setNoteListProvider`.

### Preview Mode (React) & Chat Messages

**Files:** `src/components/editor/MarkdownPreview.tsx`, `src/components/editor/LinkPreviewPopup.tsx`, `src/components/chat/ChatMessage.tsx`

Wiki links are clickable in both the note preview and AI chat responses. Both use the shared `preprocessContent()` utility (`src/utils/preprocessMarkdown.ts`) to convert `[[Title]]` syntax into `wikilink://` markdown links, and a custom `ReactMarkdown` `components.a` handler to intercept clicks and navigate via `OPEN_NOTE` dispatch.

Uses React state and mouse event handlers on the wiki link `<a>` elements:

1. `onMouseEnter` captures `clientX`/`clientY` and starts a 300ms timeout, then sets `hoverState` with the link title and mouse coordinates.
2. `onMouseLeave` starts a 200ms dismiss timeout (allows the user to move their mouse into the popup).
3. The `LinkPreviewPopup` component renders conditionally via `createPortal` to `document.body` when `hoverState` is set, using `position: fixed`.
4. A callback ref on the popup element calls `positionPopup()` on mount for accurate edge detection based on actual rendered size.
5. The popup's own `onMouseEnter` cancels the dismiss timeout; `onMouseLeave` dismisses the popup.
6. Content is rendered via `ReactMarkdown` + `remarkGfm` for consistency with the main preview.

### Positioning

Both modes share the `positionPopup()` function (exported from `wikiLinks.ts`) for smart viewport-aware placement:

- **Default**: Popup appears 12px below and to the right of the mouse cursor.
- **Right edge**: If the popup would overflow the right edge of the viewport, it flips to the left of the cursor.
- **Bottom edge**: If the popup would overflow the bottom, it flips above the cursor.
- **Clamping**: The popup is always kept at least 8px from any viewport edge.
- **Measurement**: The actual rendered size of the popup (`getBoundingClientRect()`) is used for accurate edge detection, not the max CSS dimensions.

### Shared Behavior

| Behavior | Detail |
|----------|--------|
| Show delay | 300ms hover before popup appears |
| Dismiss | Moving mouse away from both link and popup dismisses it |
| Link to popup | Mouse can move from link directly into popup without flickering |
| Content truncation | Capped at 1500 characters |
| Wiki link stripping | `preprocessForPDF()` converts `[[Title\|Alias]]` to plain text in popup content |
| Missing note | Shows "Note not found" message |
| Empty note | Shows "Empty note" message |
| Click passthrough | Clicking a wiki link still navigates (unchanged behavior) |
| Rendering | Editor: `position: fixed` DOM on `document.body`. Preview: React portal to `document.body` |

### Styling

Popup styles are defined in `src/index.css` under `.link-preview-popup`:

- Dark background (`var(--color-obsidian-bg-secondary)`) with border and box shadow
- Max dimensions: 450px wide, 320px tall with scrollable overflow
- Smaller heading sizes inside the popup (h1: 1.4em, h2: 1.2em, h3/h4: 1.05em)

## Backlinks

### Concept

Backlinks are the inverse of wiki links. If Note A contains `[[Note B]]`, then Note B's backlinks panel shows Note A as a backlink. This creates a bidirectional relationship graph.

### Backend API

**File:** `convex/notes.ts`

#### `notes.getBacklinks(noteId)`

Finds all notes that link to the specified note.

- **Parameters**: `{ noteId: Id<"notes"> }`
- **Algorithm**:
  1. Fetch the target note to get its title.
  2. Fetch all notes in the same vault.
  3. For each note, check if its content contains `[[Target Title]]`, `[[Target Title|`, or `[[Target Title#`.
  4. For matching notes, extract a context snippet (the first matching line containing the link — uses `Array.find()`). The target note itself is excluded from the scan.
  5. Return an array of `{ noteId, noteTitle, context }` objects.
- **Returns**: Array of backlink objects with note ID, title, and surrounding context.

#### `notes.getUnlinkedMentions(noteId)`

Finds notes that mention the target note's title in plain text (not inside `[[...]]` brackets).

- **Parameters**: `{ noteId: Id<"notes"> }`
- **Algorithm**:
  1. Fetch the target note to get its title.
  2. Fetch all notes in the same vault.
  3. For each note, check if its content contains the title as plain text (case-insensitive via `.toLowerCase()`). The target note itself is excluded.
  4. Exclude cases where the mention is inside `[[...]]` brackets using a heuristic: checks if the text before the mention has an unmatched `[[` (i.e., `lastIndexOf("[[") > lastIndexOf("]]")`).
  5. Extract the entire trimmed line containing the first matching mention (only the first qualifying line per note is reported, due to a `break` statement).
- **Returns**: Array of unlinked mention objects.

### Backlinks Panel

**File:** `src/components/backlinks/BacklinksPanel.tsx`

#### UI Structure

```
Backlinks Panel
├── Section: "Backlinks (N)"
│   ├── Backlink Item 1
│   │   ├── Note Title (clickable)
│   │   └── Context snippet (italic, muted)
│   ├── Backlink Item 2
│   └── ...
├── Section: "Unlinked Mentions (N)"
│   ├── Mention Item 1
│   │   ├── Note Title (clickable)
│   │   └── Context snippet
│   └── ...
└── (Empty state if no backlinks/mentions)
```

#### Features

| Feature | Description |
|---------|-------------|
| Backlink count | Displayed in section header |
| Context preview | Shows the line of text containing the link/mention |
| Click to navigate | Clicking a backlink opens that note in the editor |
| Unlinked mentions | Separate section for plain-text title matches |
| Real-time updates | Panel refreshes automatically via Convex subscriptions |

## Wiki Link Rename Propagation

**File:** `convex/notes.ts` — `notes.rename` mutation

When a note is renamed, all wiki link references to it must be updated across the vault:

### Algorithm

1. Store the old title and set the new title on the note.
2. Query all notes in the same vault.
3. For each note, search for patterns:
   - `[[Old Title]]` → replace with `[[New Title]]`
   - `[[Old Title|` → replace with `[[New Title|`
   - `[[Old Title#` → replace with `[[New Title#`
4. If any replacements were made, patch the note's content.
5. Update the renamed note's `updatedAt` timestamp.

### Example

Before rename ("Daily Log" → "Journal"):

```markdown
See my [[Daily Log]] for details.
Check [[Daily Log#Morning]] section.
Referenced in [[Daily Log|today's log]].
```

After rename:

```markdown
See my [[Journal]] for details.
Check [[Journal#Morning]] section.
Referenced in [[Journal|today's log]].
```

Note that aliases are preserved — only the title portion is updated.

## Performance Considerations

- **Backlink queries** scan all notes in the vault. This is acceptable for typical vault sizes (hundreds of notes) but may need indexing for very large vaults (thousands+).
- **Rename propagation** also scans all vault notes and performs string replacements. This is done server-side in a single mutation for consistency.
- **Autocomplete** fetches the full note list for the vault. The list is filtered client-side for responsiveness.
