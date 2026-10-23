import { create } from "zustand";
import { accountStorage as localStorage } from "../auth/accountStorage";
import type { ConfirmAnswer, ConfirmRequest, Step, Task } from "../lib/agent/loop";
import type { Autonomy } from "../lib/agent/policy";

const LEVELS: Autonomy[] = ["autopilot", "important", "tasks"];

type PendingConfirm = { request: ConfirmRequest; resolve: (answer: ConfirmAnswer) => void };

type AgentState = {
  autonomy: Autonomy;
  setAutonomy: (autonomy: Autonomy) => void;
  /** Live view of the run that is streaming right now. */
  running: boolean;
  steps: Step[];
  tasks: Task[];
  pending: PendingConfirm | null;
  begin: () => void;
  finish: () => void;
  upsertStep: (step: Step) => void;
  setTasks: (tasks: Task[]) => void;
  /** Resolves when the user clicks; a new request while one is open is refused. */
  ask: (request: ConfirmRequest) => Promise<ConfirmAnswer>;
  answer: (answer: ConfirmAnswer) => void;
};

const stored = localStorage.getItem("glow.agentAutonomy");

export const useAgentStore = create<AgentState>((set, get) => ({
  autonomy: LEVELS.includes(stored as Autonomy) ? (stored as Autonomy) : "important",
  setAutonomy: (autonomy) => {
    localStorage.setItem("glow.agentAutonomy", autonomy);
    set({ autonomy });
  },
  running: false,
  steps: [],
  tasks: [],
  pending: null,
  begin: () => set({ running: true, steps: [], tasks: [], pending: null }),
  finish: () => {
    // A run that ends with a question still open (stop button) must not leave it hanging.
    get().pending?.resolve("deny");
    set({ running: false, pending: null });
  },
  upsertStep: (step) => set((state) => {
    const index = state.steps.findIndex((item) => item.id === step.id);
    const steps = state.steps.slice();
    if (index >= 0) steps[index] = step; else steps.push(step);
    return { steps };
  }),
  setTasks: (tasks) => set({ tasks }),
  ask: (request) => new Promise<ConfirmAnswer>((resolve) => {
    if (get().pending) { resolve("deny"); return; }
    set({ pending: { request, resolve } });
  }),
  answer: (answer) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.resolve(answer);
  },
}));
