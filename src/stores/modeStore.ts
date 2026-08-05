import { create } from "zustand";
import type { AppMode } from "../lib/types";

interface ModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  gameModeActive: boolean;
  setGameModeActive: (v: boolean) => void;
  memoryPaused: boolean;
  setMemoryPaused: (v: boolean) => void;
  designMode: boolean;
  setDesignMode: (v: boolean) => void;
  chromeAgentActive: boolean;
  setChromeAgentActive: (v: boolean) => void;
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: (localStorage.getItem("glow.mode") as AppMode) || "home",
  setMode: (mode) => {
    localStorage.setItem("glow.mode", mode);
    set({ mode });
  },
  gameModeActive: false,
  setGameModeActive: (gameModeActive) =>
    set({ gameModeActive, memoryPaused: gameModeActive }),
  memoryPaused: false,
  setMemoryPaused: (memoryPaused) => set({ memoryPaused }),
  designMode: localStorage.getItem("glow.designMode") === "1",
  setDesignMode: (designMode) => {
    localStorage.setItem("glow.designMode", designMode ? "1" : "0");
    set({ designMode });
  },
  chromeAgentActive: localStorage.getItem("glow.chromeAgent") === "1",
  setChromeAgentActive: (chromeAgentActive) => {
    localStorage.setItem("glow.chromeAgent", chromeAgentActive ? "1" : "0");
    set({ chromeAgentActive });
  },
  webSearch: localStorage.getItem("glow.webSearch") === "1",
  setWebSearch: (webSearch) => {
    localStorage.setItem("glow.webSearch", webSearch ? "1" : "0");
    set({ webSearch });
  },
}));
