# Graph View

## Overview

The Graph View provides an interactive, force-directed network visualization of note relationships within a vault. Each note is represented as a node, and wiki links between notes create edges. This feature helps users visualize the structure and connectivity of their knowledge base, inspired by the graph view in the desktop Obsidian application.

## Technology

- **D3.js v7** — Used for the force simulation, SVG rendering, zoom/pan, and drag interactions.

## Architecture

**File:** `src/components/graph/GraphView.tsx`

The `GraphView` component:

1. Fetches all notes in the active vault.
2. Parses wiki links from each note's content to build a link graph.
3. Creates a D3 force simulation with nodes and links.
4. Renders an SVG with interactive nodes and edges.
5. Updates when data changes via Convex subscriptions.

## Data Processing

### Building the Graph

1. **Nodes**: Each note becomes a node with:
   - `id`: The note's `_id`
   - `title`: The note's title
   - Visual properties (radius, color)

2. **Links**: For each note, the content is scanned with regex `/\[\[([^\]|#]+)/g`:
   - The target title is extracted, stripping any `|alias` or `#heading` suffixes.
   - A case-sensitive lookup matches the title to an existing note in the vault.
   - If a match is found, a link is created: `{ source: currentNoteId, target: matchedNoteId }`.
   - Duplicate links between the same pair of notes are deduplicated.

3. **Link Count**: Each node's size is proportional to the number of incoming + outgoing links, giving highly-connected notes visual prominence.

### Example

```
Notes: [A, B, C, D]
A contains: [[B]], [[C]]
B contains: [[C]]
C contains: (no links)
D contains: [[A]]

Graph:
  D → A → B
       ↘   ↘
        C ←─┘
```

## Force Simulation

The D3 force simulation applies physics-based forces to position nodes:

| Force | Configuration | Purpose |
|-------|--------------|---------|
| `forceLink` | Fixed distance of 80px | Pulls linked nodes closer together |
| `forceManyBody` | Negative charge (repulsion) | Prevents nodes from overlapping |
| `forceCenter` | Center of SVG viewport | Keeps the graph centered |
| `forceCollide` | Radius-based collision | Prevents node overlap |

### Simulation Parameters

- **Link distance**: Fixed at 80px for all links.
- **Charge strength**: -200 (repulsion between all nodes).
- **Center force**: Gently pulls nodes toward the center of the viewport.
- **Collision radius**: Fixed at 20px for all nodes.

## Rendering

### SVG Structure

```
<svg ref={svgRef}>                   ← React JSX element with ref
  <g>                                ← Transform group for zoom/pan (no class)
    <g>                              ← Edge lines (no class)
      <line />                       ← One per link
      ...
    </g>
    <g>                              ← Node groups (no class)
      <g>                            ← One per note (no class)
        <circle />                   ← Node visual
        <text />                     ← Note title label
        <title />                    ← Native SVG tooltip
      </g>
      ...
    </g>
  </g>
</svg>
```

Note: The SVG is a React JSX element with a `ref`. D3 selects it via `d3.select(svg)` but does not create it. No CSS class names are applied to the `<g>` elements.

### Node Appearance

| Property | Value | Notes |
|----------|-------|-------|
| Shape | Circle | SVG `<circle>` |
| Radius | `Math.max(4, Math.min(12, 4 + linkCount * 2))` | Min 4px, max 12px, scales with connections |
| Color (default) | `#dcddde` (light gray) | Non-active nodes |
| Color (active) | `#8b7cf3` (accent-hover) | Currently open note |
| Stroke (default) | `transparent` | No visible stroke |
| Stroke (active) | `#8b7cf3` | Active note has accent stroke, width 2 |
| Label | Note title | Positioned to the right of the node (dx=12, dy=4) |
| Label color | `#999` | Muted gray |

### Edge Appearance

| Property | Value |
|----------|-------|
| Shape | Straight line |
| Color | `#3e3e3e` (border color) |
| Width | 1px |

## Interactions

### Node Click

Clicking a node opens the corresponding note in the editor:

1. Click event on a node circle.
2. Extracts the note ID from the node data.
3. Dispatches `OPEN_NOTE` action to the workspace context.

### Node Drag

Nodes can be dragged to manually reposition them:

1. **Drag start**: Pins the node's position (`fx`, `fy`). The simulation is reheated via `alphaTarget(0.3).restart()` to allow the graph to respond.
2. **During drag**: Updates `fx`, `fy` to follow cursor. All forces still act on other nodes.
3. **Drag end**: Releases the pinned position (`fx = null, fy = null`). Sets `alphaTarget(0)` to allow natural cooldown.

### Zoom & Pan

- **Zoom**: Mouse scroll zooms in/out (D3 zoom behavior).
- **Pan**: Click and drag on the background pans the view.
- **Zoom extent**: Constrained between 0.3x and 4x zoom.

### Tooltips

- Each node has a native SVG `<title>` element showing the note's full title on hover (browser default tooltip).
- Labels always display the full title text (no truncation is applied).

## Active Note Highlighting

The currently active note (open in the editor) is visually distinguished:

- **Different fill color**: `#8b7cf3` (accent-hover) instead of the default `#dcddde`.
- **Visible stroke**: `#8b7cf3` with width 2 (non-active nodes have transparent stroke).
- **Same radius**: The active note does not get a size boost — radius depends only on link count.

The `activeNoteId` is derived internally via `useWorkspace()` — the component accepts no props. It navigates the panes/tabs structure to find the active tab's `noteId`.

## Lifecycle

### Mount

1. SVG element (React JSX with `ref`) is selected by D3.
2. D3 zoom behavior is initialized on the SVG.
3. Force simulation is created with initial node/link data.
4. Tick function renders node/link positions on each simulation step.

### Update (data changes)

1. When notes change (created, deleted, renamed, content edited), `useQuery` returns new data.
2. The graph data (nodes/links) is recomputed with `useMemo`.
3. The entire SVG content is wiped (`selectAll("*").remove()`) and rebuilt from scratch.
4. A new simulation is created with the updated nodes and links.
5. There is no D3 enter/exit/update pattern — it is a full teardown and rebuild on each data change.

### Unmount

1. Force simulation is stopped.
2. SVG elements are cleaned up.
3. Event listeners are removed.

## Panel Placement

The graph view is displayed in the **right panel** of the app layout:

- Toggled via the workspace state: `rightPanel === "graph"`.
- Activated through:
  - Toolbar button in the app layout header.
  - Command palette: "Toggle Graph View" command.
- The panel shares space with backlinks, search, and chat (only one right panel visible at a time).

## Performance

- The force simulation runs for a fixed number of iterations, then cools down (alpha decays).
- Only visible notes are rendered (all notes in the vault — no pagination).
- For vaults with many notes (1000+), the simulation may become sluggish. No virtualization is currently implemented.
