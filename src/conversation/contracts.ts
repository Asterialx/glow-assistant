import type { AppMode, Conversation, Message, TokenUsage } from "../lib/types";

export type ConversationState = {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  branchPath: Message[];
  streaming: boolean;
};

export type GenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
};

export interface ConversationRepository {
  listConversations(scope: AppMode): Promise<Conversation[]>;
  createConversation(scope: AppMode, projectId: string | null, title: string): Promise<Conversation>;
  renameConversation(scope: AppMode, conversationId: string, title: string): Promise<void>;
  deleteConversation(scope: AppMode, conversationId: string): Promise<void>;
  setConversationProject(scope: AppMode, conversationId: string, projectId: string | null): Promise<void>;
  setConversationPinned(scope: AppMode, conversationId: string, pinned: boolean): Promise<void>;
  setConversationUnread(scope: AppMode, conversationId: string, unread: boolean): Promise<void>;
  setActiveLeaf(scope: AppMode, conversationId: string, messageId: string | null): Promise<void>;
  listMessages(scope: AppMode, conversationId: string): Promise<Message[]>;
  insertMessage(scope: AppMode, message: Message): Promise<void>;
  updateMessage(scope: AppMode, messageId: string, content: string, status: Message["status"]): Promise<void>;
  deleteMessage(scope: AppMode, messageId: string): Promise<void>;
  recordUsage(usage: Omit<TokenUsage, "id" | "created_at">): Promise<void>;
}

export interface ResponseGenerator<TGeneration> {
  stream(
    input: { history: Message[]; generation: TGeneration },
    callbacks: {
      onToken: (token: string) => void;
      onDone: (usage: GenerationUsage) => void;
      onError: (error: Error) => void;
    },
    signal: AbortSignal,
  ): Promise<void>;
}

export type ConversationResult = {
  conversationId: string;
  assistantMessage: Message;
  usage?: GenerationUsage;
  error?: Error;
};
