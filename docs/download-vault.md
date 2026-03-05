# Download & Export

## Overview

mrkdwn.me provides two export mechanisms:

1. **Download Vault** — Export an entire vault as a `.zip` file containing all notes as `.md` files organized in the vault's folder hierarchy. Built client-side using JSZip.
2. **Export Note to PDF** — Export a single note as a styled PDF document. Built client-side using html2pdf.js and marked.

## Data Flow

```
User clicks "Download Vault"
        │
        ▼
  ┌─────────────────┐
  │ useDownloadVault │  Hook: fetches folders + notes on-demand
  │ hook             │  via useConvex() (non-reactive)
  └────────┬────────┘
           │ folders[], notes[]
           ▼
  ┌─────────────────┐
  │ downloadVault   │  Utility: builds folder path map,
  │ AsZip()         │  adds files to JSZip, triggers download
  └────────┬────────┘
           │ Blob
           ▼
   Browser download
   ({VaultName}.zip)
```

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `jszip` | Client-side ZIP generation | ~45KB gzipped |

---

## Client-Side Utility

**File:** `src/utils/downloadVault.ts`

### `downloadVaultAsZip(folders, notes, vaultName)`

Builds a ZIP file from the given folders and notes, then triggers a browser download.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `folders` | `Folder[]` | Array of folder documents with `_id`, `name`, `parentId` |
| `notes` | `Note[]` | Array of note documents with `title`, `content`, `folderId` |
| `vaultName` | `string` | Used for the ZIP filename |

**Logic:**

1. **Build folder path map**: For each folder, walks up via `parentId` to construct the full path (e.g., `Projects/Web/Frontend`). Uses memoization to avoid redundant traversals.
2. **Create empty folders**: Adds all folder paths to the ZIP so the structure is preserved even for folders with no notes.
3. **Add notes**: For each note, determines its file path based on `folderId`. Notes without a `folderId` are placed at the ZIP root. File name is `{title}.md`.
4. **Generate and download**: Creates a Blob from the ZIP, creates a temporary `<a>` element with `URL.createObjectURL`, clicks it, then cleans up.

### Edge Cases

| Case | Handling |
|------|----------|
| Duplicate titles in same folder | Appends ` (2)`, ` (3)`, etc. (case-insensitive check) |
| Invalid filename characters | Strips `/ \ : * ? " < > \|` and replaces with `_` |
| Empty title | Falls back to `"Untitled"` |
| Empty content | Creates an empty `.md` file |
| Orphaned `folderId` | Note is placed at ZIP root (folder path lookup returns `""`) |

### Helper Functions

- **`sanitizeName(name)`** — Replaces characters invalid in filenames with `_`. Returns `"Untitled"` if result is empty.
- **`buildFolderPaths(folders)`** — Returns a `Map<folderId, fullPath>` by recursively resolving parent chains.

---

## Hook

**File:** `src/hooks/useDownloadVault.ts`

### `useDownloadVault()`

Returns an async `download(vaultId, vaultName)` function that fetches all folders and notes for the given vault, then calls `downloadVaultAsZip`.

**Implementation:**

- Uses `useConvex()` from `convex/react` to get a Convex client for on-demand (non-reactive) queries.
- Fetches `api.folders.list` and `api.notes.list` in parallel via `Promise.all`.
- No reactive subscriptions are created — data is fetched once at download time.

```typescript
export function useDownloadVault() {
  const client = useConvex();

  async function download(vaultId: Id<"vaults">, vaultName: string) {
    const [folders, notes] = await Promise.all([
      client.query(api.folders.list, { vaultId }),
      client.query(api.notes.list, { vaultId }),
    ]);
    await downloadVaultAsZip(folders, notes, vaultName);
  }

  return download;
}
```

---

## Frontend Integration

### Vault Selector

**File:** `src/components/vault/VaultSelector.tsx`

A `Download` icon button (lucide `Download`, size 14) is added to each vault card's hover-reveal action group, between the rename (Pencil) and delete (Trash2) buttons. Clicking it calls `downloadVault(vault._id, vault.name)`.

### Vault Switcher Dropdown

**File:** `src/components/layout/Sidebar.tsx`

A "Download Vault" option with a `Download` icon is added to the VaultSwitcher dropdown, in the bottom section above "Manage Vaults...". It downloads the currently active vault and closes the dropdown.

### Command Palette

**File:** `src/components/command-palette/CommandPalette.tsx`

A "Download Vault" command is added to the command list. It is conditionally included only when a vault is active (i.e., `state.vaultId` and `currentVault` are available). Executing it calls `downloadVault(state.vaultId, currentVault.name)`.

---

## ZIP Structure Example

For a vault named "Research" with this structure:

```
Research/
├── Projects/
│   ├── Web/
│   │   └── Frontend Notes.md
│   └── API Design.md
├── Ideas.md
└── TODO.md
```

The downloaded `Research.zip` will contain:

```
Projects/
Projects/Web/
Projects/Web/Frontend Notes.md
Projects/API Design.md
Ideas.md
TODO.md
```

---

## PDF Export (Single Note)

### Overview

Users can export any individual note as a styled PDF document. The entire process runs client-side — no backend changes are needed.

### Dependencies

| Package | Purpose |
|---------|---------|
| `html2pdf.js` | Client-side PDF generation from HTML |
| `marked` | Markdown → HTML conversion |

### Data Flow

```
User clicks "Export to PDF"
        │
        ▼
  ┌────────────────────┐
  │ useExportNotePDF() │  Hook: fetches note via useConvex()
  └──────────┬─────────┘
             │ { title, content }
             ▼
  ┌────────────────────┐
  │ exportNoteToPDF()  │  Utility: preprocess markdown,
  │                    │  convert to HTML, generate PDF
  └──────────┬─────────┘
             │ PDF Blob
             ▼
   Browser download
   ({title}.pdf)
```

### Core Utility

**File:** `src/utils/exportNoteToPDF.ts`

#### `exportNoteToPDF(title, content)`

1. **Preprocesses** markdown via `preprocessForPDF()`:
   - Preserves code blocks and inline code
   - Converts wiki links: `[[Title|Alias]]` → `Alias`, `[[Title]]` → `Title`
   - Strips hashtags (not headings): `#tag` → `tag`

2. **Converts** markdown to HTML using `marked.parse()`

3. **Wraps** in a styled HTML container:
   - Georgia serif font, 24px title with bottom border
   - Custom table styling (collapsed borders, alternating row colors)
   - Code block styling (light gray background, monospace font)
   - Blockquote styling (left border, indentation)

4. **Generates** PDF via html2pdf.js:
   - A4 portrait, 15mm margins
   - 2x canvas scale for quality
   - Filename: sanitized title (special characters → underscores)

### Hook

**File:** `src/hooks/useExportNotePDF.ts`

Returns an async `exportPDF(noteId)` function that fetches the note from Convex and calls `exportNoteToPDF()`.

### Frontend Integration

| Location | File | UI |
|----------|------|----|
| Tab bar | `src/components/layout/TabBar.tsx` | `FileDown` icon button on each tab (visible on hover) |
| Command palette | `src/components/command-palette/CommandPalette.tsx` | "Export Note to PDF" command (available when a note is open) |

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modified | Added `jszip`, `html2pdf.js`, `marked` dependencies |
| `src/utils/downloadVault.ts` | Created | ZIP building + browser download utility |
| `src/utils/exportNoteToPDF.ts` | Created | Single-note PDF export utility |
| `src/hooks/useDownloadVault.ts` | Created | Hook wrapping Convex fetch + vault download |
| `src/hooks/useExportNotePDF.ts` | Created | Hook wrapping Convex fetch + note PDF export |
| `src/components/vault/VaultSelector.tsx` | Modified | Added download button per vault |
| `src/components/layout/Sidebar.tsx` | Modified | Added "Download Vault" to VaultSwitcher dropdown |
| `src/components/layout/TabBar.tsx` | Modified | Added "Export to PDF" button per tab |
| `src/components/command-palette/CommandPalette.tsx` | Modified | Added "Download Vault" and "Export Note to PDF" commands |
