import { create } from "zustand";
import type { Artifact, Conversation, Message, Project } from "../lib/types";
import { MODEL_CATALOG } from "../lib/models";

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  branchPath: Message[];
  projects: Project[];
  activeProjectId: string | null;
  selectedModelId: string;
  temperature: number;
  maxTokens: number;
  artifacts: Artifact[];
  activeArtifactId: string | null;
  streaming: boolean;
  draft: string;
  panel: "chat" | "billing" | "agents" | "study" | "med" | "settings";
  setConversations: (c: Conversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (m: Message[]) => void;
  setBranchPath: (m: Message[]) => void;
  setProjects: (p: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
  setSelectedModelId: (id: string) => void;
  setTemperature: (n: number) => void;
  setMaxTokens: (n: number) => void;
  setArtifacts: (a: Artifact[]) => void;
  setActiveArtifactId: (id: string | null) => void;
  setStreaming: (v: boolean) => void;
  setDraft: (v: string) => void;
  setPanel: (p: ChatState["panel"]) => void;
  appendStreamingToken: (messageId: string, token: string) => void;
}

const DEFAULT_MODEL_ID = MODEL_CATALOG[0].id;

function getInitialModelId(): string {
  const stored = localStorage.getItem("glow.model");
  return MODEL_CATALOG.some((model) => model.id === stored) ? stored! : DEFAULT_MODEL_ID;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  branchPath: [],
  projects: [],
  activeProjectId: null,
  selectedModelId: getInitialModelId(),
  temperature: Number(localStorage.getItem("glow.temperature") || "0.7"),
  maxTokens: Number(localStorage.getItem("glow.maxTokens") || "4096"),
  artifacts: [],
  activeArtifactId: null,
  streaming: false,
  draft: "",
  panel: "chat",
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
  setMessages: (messages) => set({ messages }),
  setBranchPath: (branchPath) => set({ branchPath }),
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setSelectedModelId: (selectedModelId) => {
    localStorage.setItem("glow.model", selectedModelId);
    set({ selectedModelId });
  },
  setTemperature: (temperature) => {
    localStorage.setItem("glow.temperature", String(temperature));
    set({ temperature });
  },
  setMaxTokens: (maxTokens) => {
    localStorage.setItem("glow.maxTokens", String(maxTokens));
    set({ maxTokens });
  },
  setArtifacts: (artifacts) => set({ artifacts }),
  setActiveArtifactId: (activeArtifactId) => set({ activeArtifactId }),
  setStreaming: (streaming) => set({ streaming }),
  setDraft: (draft) => set({ draft }),
  setPanel: (panel) => set({ panel }),
  appendStreamingToken: (messageId, token) => {
    const messages = get().messages.map((m) =>
      m.id === messageId ? { ...m, content: m.content + token } : m,
    );
    const branchPath = get().branchPath.map((m) =>
      m.id === messageId ? { ...m, content: m.content + token } : m,
    );
    set({ messages, branchPath });
  },
}));
