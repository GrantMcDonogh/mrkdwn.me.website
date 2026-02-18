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
    title: "AI Chat",
    description:
      "Ask questions about your notes and get answers grounded in your own knowledge base. Powered by Claude, your AI reads across your entire vault.",
  },
  {
    icon: "FolderLock",
    title: "Vaults & Import",
    description:
      "Organize knowledge into separate vaults for work, personal, and research. Already use Obsidian? Import your entire vault in one click.",
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
    icon: "Bot",
    title: "MCP Server",
    description:
      "Connect your vault to Claude Code and Claude Desktop for AI-powered workflows.",
  },
  {
    icon: "Upload",
    title: "Import from Obsidian",
    description:
      "Bring your existing Obsidian vault with full folder structure and settings.",
  },
];
