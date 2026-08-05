import type { LucideIcon } from "lucide-react";
import {
  Box,
  Chrome,
  Clipboard,
  Code2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Image,
  Presentation,
  Server,
  Terminal,
  Pill,
  GitBranch,
  Container,
  Camera,
  BookOpen,
  Cuboid,
} from "lucide-react";

export type ExtensionId =
  | "filesystem"
  | "pdf-viewer"
  | "word"
  | "excel"
  | "powerpoint"
  | "blender"
  | "windows"
  | "mcp-hub"
  | "chrome"
  | "vscode"
  | "terminal"
  | "git"
  | "roblox"
  | "unity"
  | "medical-db"
  | "jupyter"
  | "dicom"
  | "clipboard"
  | "docker"
  | "screenshot";

export type ExtensionCategory =
  | "files"
  | "office"
  | "desktop"
  | "dev"
  | "design"
  | "game-dev"
  | "medical"
  | "browser";

export interface ExtensionDef {
  id: ExtensionId;
  name: string;
  description: string;
  descriptionRu: string;
  category: ExtensionCategory;
  icon: LucideIcon;
  /** Maps to Tauri MCP server id when present */
  mcpId?: string;
  /** File accept hints for the + attach picker */
  accept?: string;
  /** Config keys shown in settings */
  configKeys?: { key: string; label: string; placeholder?: string }[];
  /** Capability lines injected into the model system prompt when enabled */
  capabilities: string[];
}

export const EXTENSION_CATALOG: ExtensionDef[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Browse and list folders on this PC via Desktop Agent.",
    descriptionRu: "Просмотр папок на этом ПК через Desktop Agent.",
    category: "files",
    icon: FolderOpen,
    mcpId: "filesystem",
    configKeys: [
      { key: "root", label: "Root path", placeholder: "C:\\Users" },
    ],
    capabilities: [
      "Filesystem extension ON: you may ask the user for a path and they can list directories with Desktop Agent (list_directory).",
    ],
  },
  {
    id: "pdf-viewer",
    name: "PDF Viewer",
    description: "Extract and analyze text from PDF attachments.",
    descriptionRu: "Извлечение текста из PDF во вложениях.",
    category: "files",
    icon: FileText,
    accept: ".pdf,application/pdf",
    capabilities: [
      "PDF Viewer ON: PDF files attached by the user are extracted to text for you to analyze.",
    ],
  },
  {
    id: "word",
    name: "Microsoft Word",
    description: "Open .docx with Word and help draft documents.",
    descriptionRu: "Открытие .docx в Word и помощь с документами.",
    category: "office",
    icon: FileText,
    accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    configKeys: [{ key: "defaultFolder", label: "Default folder", placeholder: "Documents" }],
    capabilities: [
      "Word extension ON: help draft .docx content; user can open files in Microsoft Word from Glow.",
    ],
  },
  {
    id: "excel",
    name: "Microsoft Excel",
    description: "Work with spreadsheets and open .xlsx in Excel.",
    descriptionRu: "Таблицы и открытие .xlsx в Excel.",
    category: "office",
    icon: FileSpreadsheet,
    accept: ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    capabilities: [
      "Excel extension ON: help with tables/CSV/.xlsx; user can launch Excel for files.",
    ],
  },
  {
    id: "powerpoint",
    name: "PowerPoint",
    description: "Outline decks and open .pptx in PowerPoint.",
    descriptionRu: "Структура презентаций и открытие .pptx.",
    category: "office",
    icon: Presentation,
    accept: ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    capabilities: [
      "PowerPoint extension ON: help outline slides; user can open .pptx in PowerPoint.",
    ],
  },
  {
    id: "blender",
    name: "Blender",
    description: "MCP bridge for Blender 3D scenes and assets.",
    descriptionRu: "MCP-мост к Blender для 3D-сцен.",
    category: "design",
    icon: Box,
    mcpId: "blender",
    capabilities: [
      "Blender MCP ON: discuss 3D scenes; user has Blender connector enabled in Agents & MCP.",
    ],
  },
  {
    id: "windows",
    name: "Windows",
    description: "Shell, Focus Assist hints, and launching Windows apps.",
    descriptionRu: "Терминал, Focus Assist и запуск приложений Windows.",
    category: "desktop",
    icon: HardDrive,
    capabilities: [
      "Windows extension ON: user can run shell commands and open system apps from Glow Agents.",
    ],
  },
  {
    id: "mcp-hub",
    name: "MCP Hub",
    description: "Manage low-level MCP servers and custom connectors.",
    descriptionRu: "Управление MCP-серверами и кастомными коннекторами.",
    category: "dev",
    icon: Server,
    capabilities: [
      "MCP Hub ON: custom MCP connectors may be available via Agents & MCP settings.",
    ],
  },
  {
    id: "chrome",
    name: "Chrome Agent",
    description: "Browse the web with Playwright-backed Chrome agent.",
    descriptionRu: "Браузерный агент Chrome (Playwright).",
    category: "browser",
    icon: Chrome,
    mcpId: "chrome",
    capabilities: [
      "Chrome Agent ON: user can ask for web navigation tasks; Chrome connector is enabled.",
    ],
  },
  {
    id: "vscode",
    name: "VS Code / Cursor",
    description: "IDE filesystem MCP for coding workspaces.",
    descriptionRu: "MCP файловой системы IDE для кода.",
    category: "dev",
    icon: Code2,
    mcpId: "vscode",
    capabilities: [
      "VS Code/Cursor MCP ON: coding workspace connector is enabled.",
    ],
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Run shell commands from Developer Mode.",
    descriptionRu: "Запуск shell-команд из Developer Mode.",
    category: "dev",
    icon: Terminal,
    configKeys: [{ key: "cwd", label: "Default cwd", placeholder: "C:\\" }],
    capabilities: [
      "Terminal extension ON: user can execute shell commands via Glow Agents terminal.",
    ],
  },
  {
    id: "git",
    name: "Git",
    description: "Git status / diff helpers via shell.",
    descriptionRu: "Git status / diff через shell.",
    category: "dev",
    icon: GitBranch,
    configKeys: [{ key: "repo", label: "Repo path", placeholder: "C:\\path\\to\\repo" }],
    capabilities: [
      "Git extension ON: help with commits/branches; user can run git via Terminal when enabled.",
    ],
  },
  {
    id: "roblox",
    name: "Roblox Studio",
    description: "MCP connector for Roblox Studio.",
    descriptionRu: "MCP для Roblox Studio.",
    category: "game-dev",
    icon: Gamepad2,
    mcpId: "roblox",
    capabilities: ["Roblox Studio MCP ON."],
  },
  {
    id: "unity",
    name: "Unity",
    description: "MCP connector for Unity Editor.",
    descriptionRu: "MCP для Unity Editor.",
    category: "game-dev",
    icon: Cuboid,
    mcpId: "unity",
    capabilities: ["Unity MCP ON."],
  },
  {
    id: "medical-db",
    name: "Medical Drug DB",
    description: "Drug interaction checks for Med mode.",
    descriptionRu: "Проверка взаимодействий препаратов (Med).",
    category: "medical",
    icon: Pill,
    mcpId: "medical-db",
    capabilities: [
      "Medical Drug DB ON: use check_drug_interactions style advice; always include disclaimer.",
    ],
  },
  {
    id: "jupyter",
    name: "Jupyter",
    description: "Run and preview notebooks in Artifacts.",
    descriptionRu: "Ноутбуки в Artifacts.",
    category: "dev",
    icon: BookOpen,
    accept: ".ipynb,.py",
    capabilities: [
      "Jupyter extension ON: prefer ```jupyter fences for notebooks; Artifacts can preview them.",
    ],
  },
  {
    id: "dicom",
    name: "DICOM Viewer",
    description: "Attach and preview .dcm medical images.",
    descriptionRu: "Вложения и просмотр .dcm.",
    category: "medical",
    icon: Image,
    accept: ".dcm,.dicom",
    capabilities: [
      "DICOM Viewer ON: .dcm attachments open as Artifacts for review (educational, not a medical device).",
    ],
  },
  {
    id: "clipboard",
    name: "Clipboard",
    description: "Read / write the system clipboard from Glow actions.",
    descriptionRu: "Чтение и запись буфера обмена.",
    category: "desktop",
    icon: Clipboard,
    capabilities: [
      "Clipboard extension ON: user can copy assistant output and paste into Glow easily.",
    ],
  },
  {
    id: "docker",
    name: "Docker",
    description: "Docker CLI helpers via Terminal.",
    descriptionRu: "Docker CLI через Terminal.",
    category: "dev",
    icon: Container,
    capabilities: [
      "Docker extension ON: help with docker/compose; commands run via Terminal when available.",
    ],
  },
  {
    id: "screenshot",
    name: "Screenshot",
    description: "Launch Windows Snipping Tool for captures.",
    descriptionRu: "Запуск Ножниц Windows для скриншотов.",
    category: "desktop",
    icon: Camera,
    capabilities: [
      "Screenshot extension ON: user can capture the screen with Snipping Tool from extension settings.",
    ],
  },
];

export const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  files: "Files",
  office: "Office",
  desktop: "Desktop",
  dev: "Developer",
  design: "Design",
  "game-dev": "Game Dev",
  medical: "Medical",
  browser: "Browser",
};

export function getExtension(id: string): ExtensionDef | undefined {
  return EXTENSION_CATALOG.find((e) => e.id === id);
}
