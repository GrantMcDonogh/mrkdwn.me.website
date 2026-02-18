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
