import { create } from "zustand";
import { accountStorage as localStorage } from "../auth/accountStorage";
import type { ConfirmAnswer, ConfirmRequest, Question, QuestionAnswers, Step, Task } from "../lib/agent/loop";
import type { Autonomy } from "../lib/agent/policy";

const LEVELS: Autonomy[] = ["autopilot", "important", "tasks"];

type PendingConfirm = { request: ConfirmRequest; resolve: (answer: ConfirmAnswer) => void };

type PendingQuestions = { questions: Question[]; resolve: (answers: QuestionAnswers) => void };

type AgentState = {
  autonomy: Autonomy;
  setAutonomy: (autonomy: Autonomy) => void;
  /** Live view of the run that is streaming right now. */
  running: boolean;
  steps: Step[];
  tasks: Task[];
  pending: PendingConfirm | null;
  /** Multiple-choice questions the agent is waiting on. */
  questions: PendingQuestions | null;
  askQuestions: (questions: Question[]) => Promise<QuestionAnswers>;
  answerQuestions: (answers: QuestionAnswers) => void;
  /** The side panel of the Code tab: the console of run commands and the plan. */
  panelOpen: boolean;
  panelTab: "console" | "plan";
  plan: string;
  openPanel: (tab?: "console" | "plan") => void;
  closePanel: () => void;
  setPlan: (plan: string) => void;
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
  questions: null,
  askQuestions: (questions) => new Promise<QuestionAnswers>((resolve) => {
    if (get().questions) { resolve(null); return; }
    set({ questions: { questions, resolve } });
  }),
  answerQuestions: (answers) => {
    const open = get().questions;
    if (!open) return;
    set({ questions: null });
    open.resolve(answers);
  },
  panelOpen: false,
  panelTab: "console",
  plan: "",
  openPanel: (tab) => set((state) => ({ panelOpen: true, panelTab: tab ?? state.panelTab })),
  closePanel: () => set({ panelOpen: false }),
  setPlan: (plan) => set({ plan }),
  begin: () => set({ running: true, steps: [], tasks: [], pending: null, questions: null }),
  finish: () => {
    // A run that ends with a question still open (stop button) must not leave it hanging.
    get().pending?.resolve("deny");
    get().questions?.resolve(null);
    set({ running: false, pending: null, questions: null });
  },
  upsertStep: (step) => set((state) => {
    const index = state.steps.findIndex((item) => item.id === step.id);
    const steps = state.steps.slice();
    if (index >= 0) steps[index] = step; else steps.push(step);
    // The first command of a run opens the console so its output is visible as it happens.
    const open = step.name === "code_run" && index < 0 && !state.panelOpen;
    return { steps, ...(open ? { panelOpen: true, panelTab: "console" as const } : {}) };
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
