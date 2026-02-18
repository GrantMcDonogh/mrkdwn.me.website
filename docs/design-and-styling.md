# Design & CSS Styling

This document covers the complete visual design system, color palette, typography, component styling patterns, and CSS architecture used throughout mrkdwn.me.

---

## Design Philosophy

mrkdwn.me follows the desktop Obsidian app's dark-first aesthetic — a low-contrast, muted color palette designed for long reading and writing sessions. The UI is minimal and content-focused: chrome fades into the background, interactive elements reveal on hover, and the purple accent draws attention only where it matters.

---

## CSS Architecture

### Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Utility classes | **Tailwind CSS 4** (via `@tailwindcss/vite` plugin) | Layout, spacing, typography, responsive |
| Custom properties | **`@theme` block** in `src/index.css` | Design tokens (colors) |
| Global styles | Plain CSS in `src/index.css` | Scrollbar, CodeMirror overrides, live preview |
| Inline styles | D3.js `.attr()` calls | Graph view SVG elements |
| Widget styles | DOM manipulation in CodeMirror plugins | Checkbox, horizontal rule widgets |

### File Map

| File | What it styles |
|------|---------------|
| `src/index.css` | Theme tokens, global resets, scrollbars, all CodeMirror overrides |
| `src/components/editor/livePreview.ts` | Heading, bold, italic, code, blockquote, HR, checkbox decorations |
| `src/components/editor/wikiLinks.ts` | Wiki link and tag decorations |
| `src/components/graph/GraphView.tsx` | D3 force graph SVG styling (inline) |
| All `*.tsx` components | Tailwind utility classes |

---

## Color Palette

All colors are defined as Tailwind `@theme` custom properties in `src/index.css` and used via `bg-obsidian-*`, `text-obsidian-*`, `border-obsidian-*` utility classes.

### Theme Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-obsidian-bg` | `#1e1e1e` | Primary background (body, editor, gutters) |
| `--color-obsidian-bg-secondary` | `#262626` | Sidebar, top bar, cards, modals, tab bar |
| `--color-obsidian-bg-tertiary` | `#303030` | Hover states on interactive elements |
| `--color-obsidian-border` | `#3e3e3e` | All borders, dividers, split pane resizer |
| `--color-obsidian-text` | `#dcddde` | Primary text |
| `--color-obsidian-text-muted` | `#999` | Secondary text, labels, placeholders |
| `--color-obsidian-accent` | `#7f6df2` | Primary accent (buttons, active states, links, tags) |
| `--color-obsidian-accent-hover` | `#8b7cf3` | Accent hover state |
| `--color-obsidian-link` | `#7f6df2` | Wiki links in the editor |

### Hardcoded Colors (non-token)

| Color | Hex / Value | Where |
|-------|-------------|-------|
| Scrollbar thumb | `#4a4a4a` | `::-webkit-scrollbar-thumb` |
| Scrollbar thumb hover | `#5a5a5a` | `::-webkit-scrollbar-thumb:hover` |
| Active line highlight | `rgba(255,255,255,0.03)` | CodeMirror active line |
| Inline code bg | `rgba(255,255,255,0.06)` | `.cm-inline-code` |
| Tag bg | `rgba(127,109,242,0.1)` | `.cm-tag-mark` |
| Autocomplete selected | `#7f6df2` bg, `white` text | `.cm-tooltip-autocomplete` |
| Error text | Tailwind `text-red-400` | Form errors, delete buttons |
| Graph link stroke | `#3e3e3e` | D3 `<line>` elements |
| Graph node (default) | `#dcddde` | D3 `<circle>` fill |
| Graph node (active) | `#8b7cf3` | D3 `<circle>` fill when note is open |
| Graph node stroke (active) | `#8b7cf3` | D3 `<circle>` stroke |
| Graph label | `#999` | D3 `<text>` fill |
| HR widget | `#3e3e3e` | `border-top` on `<hr>` in live preview |
| Modal overlay | `bg-black/50` | Command palette & quick switcher backdrop |

---

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

Applied to both `body` and the CodeMirror editor content. No web fonts are loaded — the system font stack keeps things fast and native-feeling.

### Code Font

```css
font-family: "Fira Code", "Consolas", monospace;
```

Used only for inline code blocks (`.cm-inline-code`).

### Editor Font Size

- Base: `16px` (`.cm-editor`)
- Content padding: `16px 24px`

### Heading Scale (Live Preview)

| Level | Class | Size | Weight |
|-------|-------|------|--------|
| H1 | `.cm-heading-1` | `2em` (32px) | 700 (bold) |
| H2 | `.cm-heading-2` | `1.6em` (25.6px) | 600 (semibold) |
| H3 | `.cm-heading-3` | `1.3em` (20.8px) | 600 |
| H4-H6 | `.cm-heading-4` | `1.1em` (17.6px) | 600 |

### Text Sizes Used (Tailwind)

| Class | Size | Where |
|-------|------|-------|
| `text-2xl` | 1.5rem | Vault selector title |
| `text-lg` | 1.125rem | "No note open" message |
| `text-sm` | 0.875rem | Most UI text — tabs, explorer items, form labels, modal items |
| `text-xs` | 0.75rem | Section headers, timestamps, tag chips, search previews |

---

## Global Styles

### Box Model

```css
* { box-sizing: border-box; }
body { margin: 0; }
```

### Custom Scrollbar

Styled for WebKit browsers (Chrome, Edge, Safari):

```css
::-webkit-scrollbar        → 8px x 8px
::-webkit-scrollbar-track  → transparent
::-webkit-scrollbar-thumb  → #4a4a4a, 4px border-radius
::-webkit-scrollbar-thumb:hover → #5a5a5a
```

---

## Layout System

The app is a classic IDE-style layout built entirely with Tailwind flexbox utilities.

### Main Shell (`AppLayout.tsx`)

```
┌─────────────────────────────────────────────────┐
│  Top Bar (h-10, bg-secondary, border-b)         │
├────────┬──────────────────────────┬─────────────┤
│        │                          │             │
│ Side-  │   Editor Area            │  Right      │
│ bar    │   (split panes + tabs)   │  Panel      │
│ (w-60) │                          │  (w-72)     │
│        │                          │             │
├────────┴──────────────────────────┴─────────────┤
```

### Key Layout Classes

| Element | Classes |
|---------|---------|
| App shell | `h-screen flex flex-col bg-obsidian-bg` |
| Top bar | `h-10 bg-obsidian-bg-secondary border-b border-obsidian-border flex items-center px-2 gap-1 shrink-0` |
| Content row | `flex-1 flex min-h-0` |
| Sidebar | `w-60 border-r border-obsidian-border bg-obsidian-bg-secondary flex flex-col overflow-hidden shrink-0` |
| Editor area | `flex-1 min-w-0` |
| Right panel | `w-72 border-l border-obsidian-border bg-obsidian-bg-secondary overflow-y-auto` |
| Tab bar | `flex bg-obsidian-bg-secondary border-b border-obsidian-border overflow-x-auto shrink-0` |

### Split Pane (`SplitPane.tsx`)

- Container: `flex h-full flex-row` (vertical) or `flex-col` (horizontal)
- Divider: `w-1 cursor-col-resize bg-obsidian-border hover:bg-obsidian-accent transition-colors shrink-0`
- Pane size range: 20% to 80% (enforced in drag handler)

---

## Component Styling Patterns

### Buttons

**Primary (accent):**
```
bg-obsidian-accent hover:bg-obsidian-accent-hover text-white py-2 rounded font-medium
disabled:opacity-50 transition-colors
```

**Icon button (toolbar):**
```
p-1.5 rounded hover:bg-obsidian-bg-tertiary text-obsidian-text-muted hover:text-obsidian-text
```

**Icon button (active state):**
```
text-obsidian-accent  (replaces text-muted)
```

**Destructive:**
```
text-obsidian-text-muted hover:text-red-400 p-1
```

### Form Inputs

```
w-full bg-obsidian-bg border border-obsidian-border rounded px-3 py-2
text-obsidian-text focus:outline-none focus:border-obsidian-accent
```

Search variant (with icon):
```
bg-obsidian-bg border border-obsidian-border rounded pl-8 pr-3 py-1.5 text-sm
text-obsidian-text focus:outline-none focus:border-obsidian-accent
```

### Cards / Panels

```
bg-obsidian-bg-secondary rounded-lg border border-obsidian-border p-6
```

Vault list item (hover reveal):
```
bg-obsidian-bg-secondary border border-obsidian-border rounded-lg p-4
flex items-center justify-between hover:border-obsidian-accent/50
transition-colors group
```

### Tabs

```
flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer
border-r border-obsidian-border select-none max-w-48
```

Active: `bg-obsidian-bg text-obsidian-text`
Inactive: `bg-obsidian-bg-secondary text-obsidian-text-muted hover:text-obsidian-text`

Close button (hover reveal):
```
opacity-0 group-hover:opacity-100 hover:bg-obsidian-bg-tertiary rounded p-0.5
```

### Section Headers

Used in file explorer, backlinks, graph view, search:
```
text-xs font-semibold uppercase text-obsidian-text-muted
```

### Modals (Command Palette & Quick Switcher)

```
fixed inset-0 z-50 flex items-start justify-center pt-[20vh]
```

Backdrop: `fixed inset-0 bg-black/50`

Modal body:
```
relative w-full max-w-md bg-obsidian-bg-secondary border border-obsidian-border
rounded-lg shadow-2xl overflow-hidden
```

Input row: `flex items-center gap-2 px-3 py-2 border-b border-obsidian-border`

Result item:
```
w-full flex items-center gap-2 px-3 py-2 text-sm
```
Selected: `bg-obsidian-bg-tertiary text-obsidian-text`
Unselected: `text-obsidian-text-muted hover:bg-obsidian-bg-tertiary`

### File Explorer Items

Folder / note row:
```
flex items-center gap-1 px-2 py-1 hover:bg-obsidian-bg-tertiary cursor-pointer group text-sm
```

Active note highlight: `bg-obsidian-bg-tertiary`

Inline rename input:
```
bg-obsidian-bg border border-obsidian-accent rounded px-1 text-sm text-obsidian-text w-full
```

Action buttons (hover reveal): `ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100`

Nesting indentation: `style={{ paddingLeft: ${depth * 16}px }}`

### Tag Chips (Search Panel)

```
px-2 py-0.5 text-xs rounded bg-obsidian-bg-tertiary text-obsidian-text-muted hover:text-obsidian-text transition-colors
```

Clicking a tag sets it as the search query (no separate active/selected state).

### Backlink / Search Result Items

```
w-full text-left p-2 rounded bg-obsidian-bg hover:bg-obsidian-bg-tertiary transition-colors
```

Title row: `flex items-center gap-1.5 text-sm text-obsidian-text`
Preview: `text-xs text-obsidian-text-muted line-clamp-2`

---

## CodeMirror Editor Styling

All CodeMirror overrides live in `src/index.css` and the two editor plugins.

### Base Editor

```css
.cm-editor              → height: 100%, font-size: 16px
.cm-editor .cm-content   → padding: 16px 24px, system font stack
.cm-editor .cm-scroller  → overflow: auto
.cm-editor.cm-focused    → outline: none
.cm-editor .cm-gutters   → bg: obsidian-bg, no border
.cm-editor .cm-activeLine,
.cm-editor .cm-activeLineGutter → bg: rgba(255,255,255,0.03)
```

The editor also uses the **One Dark** theme from `@codemirror/theme-one-dark` as its base syntax highlighting theme.

### Wiki Links

```css
.cm-wiki-link       → color: obsidian-link (#7f6df2), cursor: pointer, no underline
.cm-wiki-link:hover → text-decoration: underline
```

Wiki links are rendered as replacement widgets — the `[[...]]` syntax is hidden and replaced with a clickable `<span>`.

### Tags

```css
.cm-tag-mark → color: obsidian-accent, bg: rgba(127,109,242,0.1), 3px radius, 0 2px padding
```

### Inline Code

```css
.cm-inline-code → bg: rgba(255,255,255,0.06), 3px radius, 1px 4px padding, Fira Code font, 0.9em
```

### Blockquotes

```css
.cm-blockquote-line → border-left: 3px solid obsidian-accent, padding-left: 12px, muted text color
```

### Live Preview Widgets

**Checkbox** (task list `- [ ]` / `- [x]`):
- Rendered as native `<input type="checkbox">`
- `cursor: pointer`, `margin-right: 4px`

**Horizontal Rule** (`---`):
- Rendered as `<hr>` replacing the markdown syntax
- `border: none`, `border-top: 1px solid #3e3e3e`, `margin: 1em 0`

### Autocomplete Dropdown

```css
.cm-tooltip-autocomplete       → bg: obsidian-bg-secondary, 1px border obsidian-border, 6px radius
.cm-tooltip-autocomplete li    → padding: 4px 12px, text color obsidian-text
.cm-tooltip-autocomplete li[aria-selected] → bg: obsidian-accent, white text
```

---

## Graph View Styling (D3.js)

The graph view uses D3.js with inline SVG attributes — no CSS classes.

### SVG Container

```
className="w-full h-[calc(100%-33px)]"
```

The `33px` accounts for the "Graph View" header bar.

### Force Simulation Parameters

| Force | Value |
|-------|-------|
| Link distance | `80px` |
| Charge strength | `-200` (repulsive) |
| Center | Viewport center |
| Collision radius | `20px` |

### Element Styles

**Links (`<line>`):**
- `stroke: #3e3e3e`
- `stroke-width: 1`

**Nodes (`<circle>`):**
- `r`: `max(4, min(12, 4 + linkCount * 2))` — scales with connections
- `fill`: `#dcddde` (default) or `#7f6df2` (active note)
- `stroke`: `#8b7cf3` (active) or `transparent`
- `stroke-width`: `2`
- `cursor`: `pointer`

**Labels (`<text>`):**
- `font-size`: `10`
- `fill`: `#999`
- `dx`: `12`, `dy`: `4` (offset from node center)
- `pointer-events`: `none`

### Zoom

Enabled via `d3.zoom()` with `scaleExtent([0.3, 4])` — zoom range 30% to 400%.

---

## Transitions & Animations

The app uses CSS transitions sparingly:

| Pattern | Class | Where |
|---------|-------|-------|
| Color transitions | `transition-colors` | Buttons, tabs, links, vault cards |
| Opacity transitions | `transition-opacity` | Vault card action buttons only |
| Hover reveal | `opacity-0 group-hover:opacity-100` | Tab close, explorer actions, vault actions |

No keyframe animations are used. The D3 graph uses force simulation physics (not CSS animation) for node movement.

---

## Responsive Behavior

The app currently uses **fixed widths** rather than responsive breakpoints:

- Sidebar: `w-60` (240px)
- Right panel: `w-72` (288px)
- Modals: `max-w-md` (448px)
- Auth form: `max-w-md`

The editor area fills remaining space via `flex-1 min-w-0`. Split pane resizing is constrained to 20%-80%.

No `@media` queries or responsive breakpoints are currently implemented — the app is designed for desktop viewports.

---

## Icon System

All icons come from **lucide-react** (v0.574.0). They are used as inline React components with consistent sizing:

| Context | Size prop |
|---------|-----------|
| Toolbar buttons | `18` (default) |
| Explorer items | `14` |
| Backlinks / search results | `12` |
| Empty states | `48` |

Icon color follows the parent text color via `className="text-obsidian-text-muted"` or `"text-obsidian-accent"`.

---

## Tailwind Utility Patterns Reference

Common class combinations reused across the codebase:

```
/* Centered full-screen container */
min-h-screen bg-obsidian-bg flex items-center justify-center p-4

/* Panel header */
px-3 py-2 border-b border-obsidian-border

/* Scrollable panel body */
flex-1 overflow-y-auto

/* Hover-reveal actions (inside group) */
ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100

/* Empty state */
text-center py-8 text-obsidian-text-muted text-xs

/* Clickable list item */
w-full text-left p-2 rounded hover:bg-obsidian-bg-tertiary transition-colors

/* Truncated text */
truncate  (or line-clamp-2 for multi-line)
```
