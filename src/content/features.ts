export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export const primaryFeatures: Feature[] = [
  {
    icon: "FileEdit",
    title: "Markdown Editor",
    description:
      "A powerful editor with live preview, syntax highlighting, and auto-save. Write naturally in Markdown and see your formatting come alive instantly.",
  },
  {
    icon: "Link",
    title: "Wiki Links & Backlinks",
    description:
      "Connect your ideas with [[wiki links]]. See every note that references the current one. Rename a note and watch every link update automatically.",
  },
  {
    icon: "Network",
    title: "Knowledge Graph",
    description:
      "Visualize how your notes connect with an interactive, force-directed graph. Discover hidden relationships and navigate your knowledge visually.",
  },
  {
    icon: "MessageSquare",
    title: "AI Chat & Edit Mode",
    description:
      "Ask questions about your notes and get answers grounded in your vault. Switch to edit mode to let AI modify or create notes with a diff preview before applying.",
  },
  {
    icon: "Users",
    title: "Vault Sharing",
    description:
      "Share vaults with your team. Invite collaborators by email with Owner, Editor, or Viewer roles. Real-time collaboration with permission-gated controls.",
  },
  {
    icon: "RefreshCw",
    title: "Real-Time Sync",
    description:
      "Your notes sync instantly across all your devices. Every change is persisted in real time. No manual saving, no sync conflicts, ever.",
  },
];

export const additionalFeatures: Feature[] = [
  {
    icon: "Search",
    title: "Full-Text Search",
    description: "Indexed search across titles and content with tag filtering.",
  },
  {
    icon: "Command",
    title: "Command Palette",
    description:
      "Keyboard-driven navigation. Cmd+P for commands, Cmd+O for quick switcher.",
  },
  {
    icon: "History",
    title: "Version History",
    description:
      "Automatic snapshots of every note. Browse and restore any previous version.",
  },
  {
    icon: "ClipboardList",
    title: "Audit Log",
    description:
      "Track every action across your vault with full user attribution and timestamps.",
  },
  {
    icon: "Trash2",
    title: "Trash & Recovery",
    description:
      "Soft-delete with a 5-year retention window. Restore any note or folder from the trash.",
  },
  {
    icon: "Api",
    title: "REST API & MCP Server",
    description:
      "Full CRUD API for automation. Connect Claude Code or Claude Desktop via the MCP server.",
  },
  {
    icon: "Columns3",
    title: "Split Panes & Tabs",
    description:
      "Work on multiple notes side by side with IDE-style tabs and split panes.",
  },
  {
    icon: "FolderTree",
    title: "File Explorer",
    description:
      "Organize notes in a hierarchical folder structure with drag-and-drop.",
  },
  {
    icon: "Upload",
    title: "Import & Export",
    description:
      "Import Obsidian vaults as ZIP. Export your vault or individual notes as PDF.",
  },
  {
    icon: "Eye",
    title: "Link Preview Popup",
    description:
      "Hover over any wiki link to see a rendered preview of the linked note instantly.",
  },
];
