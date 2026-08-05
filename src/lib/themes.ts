export type ThemeId =
  | "claude-dark"
  | "graphite"
  | "midnight"
  | "claude-light"
  | "paper"
  | "sand";

export type ThemeKind = "dark" | "light";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  kind: ThemeKind;
  vars: Record<string, string>;
}

export const THEMES: ThemeDef[] = [
  {
    id: "claude-dark",
    label: "Claude Dark",
    kind: "dark",
    vars: {
      "--bg": "#1f1e1d",
      "--bg-elevated": "#2a2826",
      "--bg-sidebar": "#262523",
      "--bg-input": "#2f2d2b",
      "--bg-hover": "#333130",
      "--bg-active": "#3a3835",
      "--border": "#3a3835",
      "--fg": "#f5f2eb",
      "--fg-muted": "#a39e95",
      "--fg-faint": "#7a756c",
      "--accent": "#d97757",
      "--accent-soft": "rgba(217, 119, 87, 0.15)",
      "--user-bubble": "#2c2a28",
      "--shadow": "rgba(0,0,0,0.35)",
      "--danger": "#e07a6a",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    kind: "dark",
    vars: {
      "--bg": "#18181b",
      "--bg-elevated": "#222226",
      "--bg-sidebar": "#1c1c1f",
      "--bg-input": "#27272a",
      "--bg-hover": "#2e2e33",
      "--bg-active": "#3f3f46",
      "--border": "#3f3f46",
      "--fg": "#f4f4f5",
      "--fg-muted": "#a1a1aa",
      "--fg-faint": "#71717a",
      "--accent": "#e07a5f",
      "--accent-soft": "rgba(224, 122, 95, 0.14)",
      "--user-bubble": "#3f3f46",
      "--shadow": "rgba(0,0,0,0.4)",
      "--danger": "#f07167",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    kind: "dark",
    vars: {
      "--bg": "#14161c",
      "--bg-elevated": "#1c1f28",
      "--bg-sidebar": "#171a22",
      "--bg-input": "#222633",
      "--bg-hover": "#272b38",
      "--bg-active": "#323847",
      "--border": "#2e3444",
      "--fg": "#eceef4",
      "--fg-muted": "#9aa3b5",
      "--fg-faint": "#6d7689",
      "--accent": "#d4a27f",
      "--accent-soft": "rgba(212, 162, 127, 0.14)",
      "--user-bubble": "#2a3040",
      "--shadow": "rgba(0,0,0,0.45)",
      "--danger": "#e57373",
    },
  },
  {
    id: "claude-light",
    label: "Claude Light",
    kind: "light",
    vars: {
      "--bg": "#f5f2eb",
      "--bg-elevated": "#ffffff",
      "--bg-sidebar": "#efebe3",
      "--bg-input": "#ffffff",
      "--bg-hover": "#e8e2d8",
      "--bg-active": "#ddd5c8",
      "--border": "#ddd5c8",
      "--fg": "#1f1e1c",
      "--fg-muted": "#6f6a63",
      "--fg-faint": "#9a948a",
      "--accent": "#c96442",
      "--accent-soft": "rgba(201, 100, 66, 0.12)",
      "--user-bubble": "#f0eee6",
      "--shadow": "rgba(40,30,20,0.08)",
      "--danger": "#b54a3c",
    },
  },
  {
    id: "paper",
    label: "Paper",
    kind: "light",
    vars: {
      "--bg": "#fafafa",
      "--bg-elevated": "#ffffff",
      "--bg-sidebar": "#f3f3f3",
      "--bg-input": "#ffffff",
      "--bg-hover": "#ebebeb",
      "--bg-active": "#e2e2e2",
      "--border": "#e5e5e5",
      "--fg": "#171717",
      "--fg-muted": "#737373",
      "--fg-faint": "#a3a3a3",
      "--accent": "#c45c3e",
      "--accent-soft": "rgba(196, 92, 62, 0.1)",
      "--user-bubble": "#f0f0f0",
      "--shadow": "rgba(0,0,0,0.06)",
      "--danger": "#dc2626",
    },
  },
  {
    id: "sand",
    label: "Sand",
    kind: "light",
    vars: {
      "--bg": "#f3efe6",
      "--bg-elevated": "#fbf8f1",
      "--bg-sidebar": "#ebe4d6",
      "--bg-input": "#fbf8f1",
      "--bg-hover": "#e4dccb",
      "--bg-active": "#d8cfbb",
      "--border": "#d8cfbb",
      "--fg": "#2a261f",
      "--fg-muted": "#7a7264",
      "--fg-faint": "#a09786",
      "--accent": "#b85c3c",
      "--accent-soft": "rgba(184, 92, 60, 0.12)",
      "--user-bubble": "#e4dccb",
      "--shadow": "rgba(50,40,20,0.08)",
      "--danger": "#a63d32",
    },
  },
];

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.kind = theme.kind;
  Object.entries(theme.vars).forEach(([k, v]) => {
    if (k.startsWith("--")) root.style.setProperty(k, v);
  });
  root.style.colorScheme = theme.kind;
}
