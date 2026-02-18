# Markdown Editor

## Overview

The Markdown editor is the core content creation and editing component of mrkdwn.me. It is built on [CodeMirror 6](https://codemirror.net/), configured with a rich set of extensions for Markdown editing, syntax highlighting, live preview, wiki link support, and auto-save functionality.

## Architecture

**Primary File:** `src/components/editor/MarkdownEditor.tsx`

The editor is implemented as a React component that manages a CodeMirror `EditorView` instance. Key related modules:

| File | Purpose |
|------|---------|
| `MarkdownEditor.tsx` | Main editor component, CodeMirror setup, auto-save |
| `wikiLinks.ts` | Wiki link detection, rendering, autocomplete |
| `livePreview.ts` | Live preview decorations for Markdown syntax |

## CodeMirror Extensions

The editor is configured with the following CodeMirror extensions:

| Extension | Package | Purpose |
|-----------|---------|---------|
| Markdown language | `@codemirror/lang-markdown` | Markdown syntax support and parsing |
| One Dark theme | `@codemirror/theme-one-dark` | Dark color scheme |
| Line numbers | `@codemirror/view` | Line number gutter |
| Active line highlight | `@codemirror/view` | Highlights the current line |
| Bracket matching | `@codemirror/language` | Matches brackets/parens |
| History | `@codemirror/commands` | Undo/redo support |
| Default keymap | `@codemirror/commands` | Standard editor keybindings |
| Search keymap | `@codemirror/search` | Find/replace functionality |
| Autocomplete | `@codemirror/autocomplete` | Wiki link completion |
| Wiki link plugin | `wikiLinks.ts` | Renders and navigates wiki links |
| Live preview plugin | `livePreview.ts` | Inline Markdown formatting preview |
| Update listener | `@codemirror/view` | Triggers auto-save on changes |

## Component Lifecycle

### Initialization

1. The component receives a `noteId` prop and accesses workspace context via `useWorkspace()` for `vaultId` and `dispatch`.
2. Note data is fetched via `useQuery(api.notes.get, { id: noteId })`. All vault notes are also fetched via `useQuery(api.notes.list, { vaultId })` for wiki link autocomplete and navigation.
3. On mount (or when `noteId` changes), a new `EditorView` is created. Wiki link navigation (`setWikiLinkNavigator`) and note list provider (`setNoteListProvider`) callbacks are injected.
4. The editor state is initialized with the note's `content`.
5. All extensions are applied.
6. The view is attached to the component's container `div`.

### Content Synchronization

When the note's content changes externally (e.g., from a wiki link rename):

1. The `useQuery` hook returns updated note data.
2. The component checks if the editor's current content differs from the server content.
3. If different and the editor is not currently focused (`!view.hasFocus`), the document content is replaced via a `view.dispatch()` transaction (preserving undo history and editor state).
4. This prevents overwriting the user's in-progress edits while keeping the editor in sync.

### Cleanup

On unmount:

1. Any pending save timeout is cleared and the save is flushed immediately (but only if content has changed since last save — a dedup check via `lastSavedContentRef`).
2. The `EditorView` is destroyed via `view.destroy()`.
3. The view ref is nulled (`viewRef.current = null`).

## Auto-Save

### Mechanism

- **Trigger**: The `EditorView.updateListener` fires on every document change.
- **Debounce**: A `setTimeout` with a 500ms delay prevents excessive writes.
- **Save**: Calls `notes.update` mutation with the current editor content.
- **Flush on unmount**: If a save is pending when the component unmounts, it fires immediately.

### Flow

```
User types → EditorView.updateListener fires
  → clearTimeout(existing timer)
  → setTimeout(500ms) → save(content)
    → if content !== lastSavedContentRef.current:
      → updateNote({ id: noteId, content })
      → lastSavedContentRef.current = content
```

## Live Preview Mode

**File:** `src/components/editor/livePreview.ts`

The live preview plugin provides inline visual formatting of Markdown syntax without switching to a separate preview pane.

### Supported Markdown Elements

| Element | Syntax | Rendering |
|---------|--------|-----------|
| Heading 1 | `# text` | 2em, font-weight 700 |
| Heading 2 | `## text` | 1.6em, font-weight 600 |
| Heading 3 | `### text` | 1.3em, font-weight 600 |
| Heading 4 | `#### text` | 1.1em, font-weight 600 |
| Heading 5-6 | `##### text` | Clamped to H4 styling (level capped at 4 via `Math.min(level, 4)`) |
| Bold | `**text**` | Bold weight |
| Italic | `*text*` | Italic style |
| Inline code | `` `text` `` | Monospace with background |
| Blockquote | `> text` | Left border (3px solid accent) + muted color (no italic) |
| Task (unchecked) | `- [ ] text` | Interactive checkbox (clicking toggles `[ ]`/`[x]` in source) |
| Task (checked) | `- [x] text` | Interactive checked checkbox (no strikethrough) |
| Horizontal rule | `---` / `***` | Styled divider line (Decoration.replace with HrWidget) |
| Tags | `#tag-name` | Accent text color with subtle 10% opacity background (`var(--color-obsidian-accent)`) |

### Implementation

The live preview uses CodeMirror's `ViewPlugin` and `DecorationSet`:

1. A `ViewPlugin` iterates over the visible document range.
2. For most elements, it uses the syntax tree to detect Markdown patterns.
3. Tags are detected separately via regex scan (`/(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g`) outside the syntax tree iteration.
4. Three types of decorations are used:
   - `Decoration.line()` for headings and blockquotes (applies CSS classes to the line).
   - `Decoration.mark()` for inline formatting (bold, italic, code, tags).
   - `Decoration.replace()` with widgets for task checkboxes (`CheckboxWidget`) and horizontal rules (`HrWidget`).
5. The plugin efficiently updates only when the viewport or document changes.

## Editor Theming

### Custom CSS

The editor applies the One Dark theme as a base, with custom overrides in `src/index.css`:

```css
.cm-editor {
  height: 100%;
  font-size: 16px;
}

.cm-editor .cm-content {
  padding: 16px 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', ...;
}

.cm-editor .cm-scroller {
  overflow: auto;
}

.cm-editor.cm-focused {
  outline: none;
}

.cm-editor .cm-activeLine,
.cm-editor .cm-activeLineGutter {
  background-color: rgba(255, 255, 255, 0.03);
}

.cm-editor .cm-gutters {
  background: var(--color-obsidian-bg);
  border-right: none;
}
```

### Color Scheme

The editor follows the Obsidian dark theme:

- Background: `#1e1e1e`
- Text: `#dcddde`
- Line numbers / gutters: Subtle muted color
- Active line: Very slight white overlay
- Selection: Accent color with transparency

## Props

| Prop | Type | Description |
|------|------|-------------|
| `noteId` | `Id<"notes">` | The ID of the note to edit |

The component also depends on `useWorkspace()` context for `vaultId` (used to fetch all notes for wiki link features) and `dispatch` (used for `OPEN_NOTE` action when clicking wiki links).

## Key Behaviors

1. **Single Source of Truth**: The Convex database is the source of truth. The editor reads from it on mount and writes back on save.
2. **Optimistic Updates**: Users see their changes immediately in the editor. Saves happen asynchronously in the background.
3. **No Explicit Save Button**: All saves are automatic via debounced auto-save.
4. **External Update Handling**: If a note is updated externally (e.g., wiki link rename), the editor reflects the change without disrupting the user's cursor position (when not actively editing).
