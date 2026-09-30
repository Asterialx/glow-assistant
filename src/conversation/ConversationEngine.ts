import type { AppMode, Conversation, Message } from "../lib/types";
import { isDefaultChatTitle, titleFromFirstMessage } from "../lib/utils";
import type {
  ConversationRepository,
  ConversationResult,
  ConversationState,
  ResponseGenerator,
} from "./contracts";

type SendInput<TGeneration> = {
  scope: AppMode;
  content: string;
  modelId: string;
  generation: TGeneration;
  conversationId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  titleSource?: string;
};

type RegenerateInput<TGeneration> = {
  scope: AppMode;
  assistantMessage: Message;
  modelId: string;
  generation: TGeneration;
};

const EMPTY_STATE: ConversationState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  branchPath: [],
  streaming: false,
};

/**
 * Provider- and persistence-agnostic conversation use cases.
 * Infrastructure is injected through ports; this class never imports UI, Tauri,
 * localStorage, SQLite, or an LLM provider.
 */
export class ConversationEngine<TGeneration> {
  private state: ConversationState = EMPTY_STATE;
  private listeners = new Set<(state: ConversationState) => void>();
  private activeAbortController: AbortController | null = null;

  constructor(
    private readonly repository: ConversationRepository,
    private readonly generator: ResponseGenerator<TGeneration>,
    private readonly createId: () => string,
    private readonly now: () => number,
  ) {}

  getState(): ConversationState {
    return this.state;
  }

  subscribe(listener: (state: ConversationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refresh(scope: AppMode): Promise<Conversation[]> {
    const conversations = await this.repository.listConversations(scope);
    this.setState({ conversations });
    return conversations;
  }

  async select(scope: AppMode, conversationId: string): Promise<void> {
    const [messages, conversations] = await Promise.all([
      this.repository.listMessages(scope, conversationId),
      this.repository.listConversations(scope),
    ]);
    const conversation = conversations.find((item) => item.id === conversationId);
    const leafId = conversation?.active_leaf_id ?? messages.at(-1)?.id ?? null;
    this.setState({
      conversations,
      activeConversationId: conversationId,
      messages,
      branchPath: pathToLeaf(messages, leafId),
    });
  }

  startNew(): void {
    this.setState({ activeConversationId: null, messages: [], branchPath: [] });
  }

  async ensureConversation(scope: AppMode, projectId: string | null): Promise<Conversation> {
    const activeId = this.state.activeConversationId;
    if (activeId) {
      const current = this.state.conversations.find((conversation) => conversation.id === activeId);
      if (current) return current;
    }
    return this.createConversation(scope, projectId, "New chat");
  }

  async createConversation(scope: AppMode, projectId: string | null, title = "New chat"): Promise<Conversation> {
    const conversation = await this.repository.createConversation(scope, projectId, title);
    await this.refresh(scope);
    this.setState({ activeConversationId: conversation.id, messages: [], branchPath: [] });
    return conversation;
  }

  async send(input: SendInput<TGeneration>): Promise<ConversationResult | null> {
    if (this.state.streaming) return null;
    const conversation = input.conversationId
      ? await this.resolveConversation(input.scope, input.conversationId)
      : await this.ensureConversation(input.scope, input.projectId ?? null);
    const parentId = input.parentId === undefined ? this.state.branchPath.at(-1)?.id ?? null : input.parentId;

    if (isDefaultChatTitle(conversation.title) && input.parentId === undefined) {
      const title = titleFromFirstMessage(input.titleSource ?? input.content);
      if (title && !isDefaultChatTitle(title)) {
        await this.repository.renameConversation(input.scope, conversation.id, title);
      }
    }

    const userMessage: Message = {
      id: this.createId(),
      conversation_id: conversation.id,
      parent_id: parentId,
      role: "user",
      content: input.content,
      model_id: null,
      status: "done",
      created_at: this.now(),
    };
    await this.repository.insertMessage(input.scope, userMessage);
    return this.generateAssistantReply(input.scope, userMessage, input.modelId, input.generation);
  }

  async regenerate(input: RegenerateInput<TGeneration>): Promise<ConversationResult | null> {
    if (this.state.streaming || input.assistantMessage.role !== "assistant") return null;
    const parentId = input.assistantMessage.parent_id;
    if (!parentId) return null;
    const messages = await this.repository.listMessages(input.scope, input.assistantMessage.conversation_id);
    const userMessage = messages.find((message) => message.id === parentId && message.role === "user");
    if (!userMessage) return null;
    return this.generateAssistantReply(input.scope, userMessage, input.modelId, input.generation);
  }

  async continueGeneration(input: RegenerateInput<TGeneration>): Promise<ConversationResult | null> {
    if (this.state.streaming || input.assistantMessage.role !== "assistant") return null;
    return this.generateAssistantReply(input.scope, input.assistantMessage, input.modelId, input.generation);
  }

  async editAndResend(input: SendInput<TGeneration> & { editedMessage: Message }): Promise<ConversationResult | null> {
    const { editedMessage } = input;
    if (editedMessage.role !== "user" || this.state.streaming) return null;
    const content = input.content.trim();
    if (!content || content === editedMessage.content) return null;
    await this.repository.setActiveLeaf(input.scope, editedMessage.conversation_id, editedMessage.parent_id);
    await this.select(input.scope, editedMessage.conversation_id);
    return this.send({
      ...input,
      content,
      conversationId: editedMessage.conversation_id,
      parentId: editedMessage.parent_id,
      titleSource: content,
    });
  }

  stopGeneration(): void {
    this.activeAbortController?.abort();
  }

  async deleteMessage(scope: AppMode, messageId: string): Promise<void> {
    const message = this.state.messages.find((item) => item.id === messageId);
    if (!message) return;
    const descendants = collectDescendantIds(this.state.messages, messageId);
    for (const id of descendants) await this.repository.deleteMessage(scope, id);
    const nextLeaf = descendants.includes(this.state.branchPath.at(-1)?.id ?? "") ? message.parent_id : undefined;
    if (nextLeaf !== undefined) await this.repository.setActiveLeaf(scope, message.conversation_id, nextLeaf);
    await this.select(scope, message.conversation_id);
  }

  async deleteConversation(scope: AppMode, conversationId: string): Promise<void> {
    await this.repository.deleteConversation(scope, conversationId);
    if (this.state.activeConversationId === conversationId) this.startNew();
    await this.refresh(scope);
  }

  async renameConversation(scope: AppMode, conversationId: string, title: string): Promise<void> {
    await this.repository.renameConversation(scope, conversationId, title);
    await this.refresh(scope);
  }

  async setConversationPinned(scope: AppMode, conversationId: string, pinned: boolean): Promise<void> {
    await this.repository.setConversationPinned(scope, conversationId, pinned);
    await this.refresh(scope);
  }

  async setConversationUnread(scope: AppMode, conversationId: string, unread: boolean): Promise<void> {
    await this.repository.setConversationUnread(scope, conversationId, unread);
    await this.refresh(scope);
  }

  async setConversationProject(scope: AppMode, conversationId: string, projectId: string | null): Promise<void> {
    await this.repository.setConversationProject(scope, conversationId, projectId);
    await this.refresh(scope);
  }

  async appendMessage(scope: AppMode, message: Message): Promise<void> {
    await this.repository.insertMessage(scope, message);
    await this.repository.setActiveLeaf(scope, message.conversation_id, message.id);
    await this.select(scope, message.conversation_id);
  }

  private async generateAssistantReply(
    scope: AppMode,
    parentMessage: Message,
    modelId: string,
    generation: TGeneration,
  ): Promise<ConversationResult> {
    const assistantMessage: Message = {
      id: this.createId(),
      conversation_id: parentMessage.conversation_id,
      parent_id: parentMessage.id,
      role: "assistant",
      content: "",
      model_id: modelId,
      status: "streaming",
      created_at: this.now(),
    };
    await this.repository.insertMessage(scope, assistantMessage);
    await this.repository.setActiveLeaf(scope, assistantMessage.conversation_id, assistantMessage.id);

    const messages = await this.repository.listMessages(scope, assistantMessage.conversation_id);
    const history = pathToLeaf(messages, assistantMessage.id).filter((message) => message.id !== assistantMessage.id);
    this.setState({
      activeConversationId: assistantMessage.conversation_id,
      messages,
      branchPath: pathToLeaf(messages, assistantMessage.id),
      streaming: true,
    });

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    return new Promise<ConversationResult>((resolve) => {
      const finish = async (usage?: { inputTokens: number; outputTokens: number; costUnits: number }, error?: Error) => {
        const current = this.findMessage(assistantMessage.id);
        const content = current?.content ?? "";
        const stopped = abortController.signal.aborted;
        const status: Message["status"] = error && !stopped ? "error" : "done";
        const storedContent = error && !stopped ? `Error: ${error.message}` : content;
        await this.repository.updateMessage(scope, assistantMessage.id, storedContent, status);
        if (usage) {
          await this.repository.recordUsage({
            mode: scope,
            conversation_id: assistantMessage.conversation_id,
            message_id: assistantMessage.id,
            model_id: modelId,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cost_units: usage.costUnits,
          });
        }
        this.activeAbortController = null;
        this.setState({ streaming: false });
        await this.select(scope, assistantMessage.conversation_id);
        await this.refresh(scope);
        resolve({
          conversationId: assistantMessage.conversation_id,
          assistantMessage: { ...assistantMessage, content: storedContent, status },
          usage,
          error: error && !stopped ? error : undefined,
        });
      };

      void this.generator
        .stream(
          { history, generation },
          {
            onToken: (token) => this.appendToken(assistantMessage.id, token),
            onDone: (usage) => void finish(usage),
            onError: (error) => void finish(undefined, error),
          },
          abortController.signal,
        )
        .catch((error: unknown) => void finish(undefined, toError(error)));
    });
  }

  private async resolveConversation(scope: AppMode, conversationId: string): Promise<Conversation> {
    const conversations = await this.repository.listConversations(scope);
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} was not found`);
    this.setState({ conversations });
    return conversation;
  }

  private appendToken(messageId: string, token: string): void {
    const update = (messages: Message[]) =>
      messages.map((message) => (message.id === messageId ? { ...message, content: message.content + token } : message));
    this.setState({ messages: update(this.state.messages), branchPath: update(this.state.branchPath) });
  }

  private findMessage(messageId: string): Message | undefined {
    return this.state.branchPath.find((message) => message.id === messageId);
  }

  private setState(change: Partial<ConversationState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
}

function pathToLeaf(messages: Message[], leafId: string | null): Message[] {
  if (!leafId) return messages.filter((message) => message.role !== "system");
  const byId = new Map(messages.map((message) => [message.id, message]));
  const path: Message[] = [];
  let current = byId.get(leafId);
  while (current) {
    path.push(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path.reverse();
}

function collectDescendantIds(messages: Message[], rootId: string): string[] {
  const ids = [rootId];
  for (let index = 0; index < ids.length; index += 1) {
    const parentId = ids[index];
    for (const message of messages) {
      if (message.parent_id === parentId) ids.push(message.id);
    }
  }
  return ids.reverse();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
