export type AppMode = "home" | "code" | "med";

export type MessageRole = "system" | "user" | "assistant" | "tool";
export type MessageStatus = "pending" | "streaming" | "done" | "error";

export type ModelTier = "premium" | "balanced" | "cheap" | "ultra_cheap" | "image";

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  costMultiplier: number | null;
  costPerImage: number | null;
  tier: ModelTier;
  useCase: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  name: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

export interface Conversation {
  id: string;
  project_id: string | null;
  title: string;
  active_leaf_id: string | null;
  created_at: number;
  updated_at: number;
  pinned?: number;
  unread?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: MessageRole;
  content: string;
  model_id: string | null;
  status: MessageStatus;
  created_at: number;
}

export interface UiWidget {
  id: string;
  message_id: string;
  widget_type: "checklist" | "progress" | "flashcard" | "flashcards" | "biomarker_table";
  state_json: string;
  updated_at: number;
}

export interface Artifact {
  id: string;
  conversation_id: string;
  message_id: string | null;
  kind: "html" | "code" | "pdf" | "stl" | "obj" | "dcm" | "jupyter" | "image";
  title: string | null;
  content_path: string | null;
  content_text: string | null;
  meta_json: string;
  created_at: number;
}

export interface Attachment {
  id: string;
  message_id: string | null;
  conversation_id: string;
  file_name: string;
  mime_type: string | null;
  local_path: string;
  size_bytes: number | null;
  created_at: number;
}

export interface TokenUsage {
  id: string;
  mode: AppMode;
  conversation_id: string | null;
  message_id: string | null;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_units: number;
  created_at: number;
}

export interface GlobalMemory {
  id: string;
  fact: string;
  source_mode: string | null;
  confidence: number;
  created_at: number;
  updated_at: number;
}

export interface DomainRecord {
  id: string;
  record_type: string;
  payload_json: string;
  created_at: number;
  updated_at: number;
}

export const MODE_SYSTEM_PROMPTS: Record<AppMode, string> = {
  home: "Workspace mode: Home. Prefer clear, warm, practical answers for everyday life, planning, and general questions.",
  code: "Workspace mode: Code. Prefer precise code, algorithms, LaTeX math, and actionable diffs for Applied Math/CS work.",
  med: "Workspace mode: Med. Preventative-medicine assistant. Never invent patient data. Emphasize privacy. Always include a clinical disclaimer. Patient PII may already be redacted.",
};
