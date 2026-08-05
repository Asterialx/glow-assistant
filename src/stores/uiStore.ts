import { create } from "zustand";
import type { Locale } from "../lib/i18n";
import { applyTheme, type ThemeId } from "../lib/themes";

interface UiState {
  locale: Locale;
  themeId: ThemeId;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsTab: string;
  appsOpen: boolean;
  artifactsOpen: boolean;
  artifactsWidth: number;
  userName: string;
  setLocale: (l: Locale) => void;
  setThemeId: (id: ThemeId) => void;
  setSidebarOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setSettingsTab: (t: string) => void;
  setAppsOpen: (v: boolean) => void;
  setArtifactsOpen: (v: boolean) => void;
  setArtifactsWidth: (w: number) => void;
  openArtifacts: () => void;
  closeArtifacts: () => void;
  setUserName: (n: string) => void;
}

function loadTheme(): ThemeId {
  return (localStorage.getItem("glow.theme") as ThemeId) || "claude-dark";
}

function loadLocale(): Locale {
  return (localStorage.getItem("glow.locale") as Locale) || "ru";
}

function loadUserName(): string {
  const stored = localStorage.getItem("glow.userName");
  if (!stored || stored === "Sergey") return "Guest";
  return stored;
}

const ARTIFACTS_MIN = 280;
const ARTIFACTS_MAX = 900;
const ARTIFACTS_DEFAULT = 400;

function loadArtifactsWidth(): number {
  const raw = Number(localStorage.getItem("glow.artifactsWidth"));
  if (!Number.isFinite(raw)) return ARTIFACTS_DEFAULT;
  return Math.min(ARTIFACTS_MAX, Math.max(ARTIFACTS_MIN, raw));
}

export function clampArtifactsWidth(w: number): number {
  return Math.min(ARTIFACTS_MAX, Math.max(ARTIFACTS_MIN, Math.round(w)));
}

export const useUiStore = create<UiState>((set) => ({
  locale: loadLocale(),
  themeId: loadTheme(),
  sidebarOpen: true,
  settingsOpen: false,
  settingsTab: "general",
  appsOpen: false,
  artifactsOpen: false,
  artifactsWidth: loadArtifactsWidth(),
  userName: loadUserName(),
  setLocale: (locale) => {
    localStorage.setItem("glow.locale", locale);
    set({ locale });
  },
  setThemeId: (themeId) => {
    localStorage.setItem("glow.theme", themeId);
    applyTheme(themeId);
    set({ themeId });
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setAppsOpen: (appsOpen) => set({ appsOpen }),
  setArtifactsOpen: (artifactsOpen) => set({ artifactsOpen }),
  setArtifactsWidth: (w) => {
    const artifactsWidth = clampArtifactsWidth(w);
    localStorage.setItem("glow.artifactsWidth", String(artifactsWidth));
    set({ artifactsWidth });
  },
  openArtifacts: () => set({ artifactsOpen: true }),
  closeArtifacts: () => set({ artifactsOpen: false }),
  setUserName: (userName) => {
    localStorage.setItem("glow.userName", userName);
    set({ userName });
  },
}));

export function initUiTheme() {
  applyTheme(loadTheme());
}
