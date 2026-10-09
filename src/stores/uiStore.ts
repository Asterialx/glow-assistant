import { create } from "zustand";
import type { Locale } from "../lib/i18n";
import { applyTheme, type ThemeId } from "../lib/themes";
import { validateHtmlPreviewState, type HtmlPreviewState } from "../lib/htmlArtifact";
import { validateStudyCompletion } from "../lib/studyPlan";

interface UiState {
  locale: Locale;
  themeId: ThemeId;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsTab: string;
  appsOpen: boolean;
  artifactsOpen: boolean;
  artifactsWidth: number;
  artifactViewState: Record<string, ArtifactViewState>;
  userName: string;
  setLocale: (l: Locale) => void;
  setThemeId: (id: ThemeId) => void;
  setSidebarOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setSettingsTab: (t: string) => void;
  setAppsOpen: (v: boolean) => void;
  setArtifactsOpen: (v: boolean) => void;
  setArtifactsWidth: (w: number) => void;
  setArtifactViewState: (artifactId: string, state: ArtifactViewState) => void;
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

interface ArtifactViewState {
  studyCompleted?: Record<string, boolean>;
  htmlPreview?: { source: string; state: HtmlPreviewState };
  chartType?: "bar" | "line";
  calculatorValues?: Record<string, number>;
  questionnaireAnswers?: Record<string, { selected: string[]; other: string }>;
  questionnaireStep?: number;
  questionnaireSubmitted?: boolean;
}

function loadArtifactViewState(): Record<string, ArtifactViewState> {
  try {
    const raw = JSON.parse(localStorage.getItem("glow.artifactViewState") || "{}") as Record<
      string,
      {
        studyCompleted?: unknown;
        chartType?: unknown;
        calculatorValues?: unknown;
        questionnaireAnswers?: unknown;
        questionnaireStep?: unknown;
        questionnaireSubmitted?: unknown;
        htmlPreview?: unknown;
      }
    >;
    const entries = Object.entries(raw).slice(-100).flatMap(([id, state]) => {
      if (!state || typeof state !== "object") return [];
      const chartType: "bar" | "line" | undefined =
        state.chartType === "bar" || state.chartType === "line" ? state.chartType : undefined;
      const calculatorValues =
        state.calculatorValues && typeof state.calculatorValues === "object" && !Array.isArray(state.calculatorValues)
          ? Object.fromEntries(
              Object.entries(state.calculatorValues as Record<string, unknown>)
                .slice(0, 6)
                .filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key) && typeof value === "number" && Number.isFinite(value)),
            ) as Record<string, number>
          : undefined;
      const questionnaireAnswers =
        state.questionnaireAnswers && typeof state.questionnaireAnswers === "object" && !Array.isArray(state.questionnaireAnswers)
          ? Object.fromEntries(
              Object.entries(state.questionnaireAnswers as Record<string, unknown>)
                .slice(0, 10)
                .flatMap(([questionId, answer]) => {
                  if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(questionId) || !answer || typeof answer !== "object" || Array.isArray(answer)) return [];
                  const value = answer as { selected?: unknown; other?: unknown };
                  const selected = Array.isArray(value.selected)
                    ? value.selected.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => item.slice(0, 120))
                    : [];
                  const other = typeof value.other === "string" ? value.other.slice(0, 500) : "";
                  return [[questionId, { selected, other }] as const];
                }),
            ) as Record<string, { selected: string[]; other: string }>
          : undefined;
      const questionnaireStep =
        typeof state.questionnaireStep === "number" && Number.isInteger(state.questionnaireStep)
          ? Math.max(0, Math.min(9, state.questionnaireStep))
          : undefined;
      const questionnaireSubmitted = state.questionnaireSubmitted === true ? true : undefined;
      const htmlCandidate = state.htmlPreview as { source?: unknown; state?: unknown } | undefined;
      const htmlState = validateHtmlPreviewState(htmlCandidate?.state);
      const htmlPreview = htmlState && typeof htmlCandidate?.source === "string" && htmlCandidate.source.length <= 64
        ? { source: htmlCandidate.source, state: htmlState } : undefined;
      const studyCompleted = validateStudyCompletion(state.studyCompleted);
      return chartType || calculatorValues || questionnaireAnswers || questionnaireStep !== undefined || questionnaireSubmitted || htmlPreview || studyCompleted
        ? [[id, {
            ...(chartType ? { chartType } : {}),
            ...(calculatorValues ? { calculatorValues } : {}),
            ...(questionnaireAnswers ? { questionnaireAnswers } : {}),
            ...(questionnaireStep !== undefined ? { questionnaireStep } : {}),
            ...(questionnaireSubmitted ? { questionnaireSubmitted } : {}),
            ...(htmlPreview ? { htmlPreview } : {}),
            ...(studyCompleted ? { studyCompleted } : {}),
          }] as const]
        : [];
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
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
  artifactViewState: loadArtifactViewState(),
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
  setArtifactViewState: (artifactId, next) => {
    const artifactViewState = {
      ...useUiStore.getState().artifactViewState,
      [artifactId]: {
        ...useUiStore.getState().artifactViewState[artifactId],
        ...next,
      },
    };
    const bounded = Object.fromEntries(Object.entries(artifactViewState).slice(-100));
    localStorage.setItem("glow.artifactViewState", JSON.stringify(bounded));
    set({ artifactViewState: bounded });
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
