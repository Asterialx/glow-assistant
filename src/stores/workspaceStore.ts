import { create } from "zustand";
import { accountStorage as localStorage } from "../auth/accountStorage";

type WorkspaceState = {
  taskMode: "work" | "plan";
  setTaskMode: (taskMode: "work" | "plan") => void;
  enabled: boolean;
  folderName: string | null;
  taskStatus: string;
  setEnabled: (enabled: boolean) => void;
  setFolderName: (folderName: string | null) => void;
  setTaskStatus: (taskStatus: string) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  taskMode: "work",
  setTaskMode: (taskMode) => set({ taskMode }),
  enabled: localStorage.getItem("glow.workspaceMode") === "work",
  folderName: null,
  taskStatus: "",
  setEnabled: (enabled) => {
    localStorage.setItem("glow.workspaceMode", enabled ? "work" : "chat");
    set({ enabled });
  },
  setFolderName: (folderName) => set({ folderName }),
  setTaskStatus: (taskStatus) => set({ taskStatus }),
}));
