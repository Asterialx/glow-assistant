import { buildChatPayload, streamChatCompletion } from "../../lib/llm/smartapi";
import type { ResponseGenerator } from "../contracts";
import { BUILTIN_SKILLS, skillInstructions } from "../../lib/skills";
import { useSkillsStore } from "../../stores/skillsStore";
import { splitSearchSources } from "../../lib/searchSources";

/**
 * Transitional adapter for the existing SmartAPI integration.
 * Provider-specific payload construction stays outside ConversationEngine.
 */
export type LegacyGenerationOptions = {
  mode: "home" | "code" | "med";
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemExtra: string;
  memory: string[];
  designMode: boolean;
  webSearch: boolean;
};

export const smartApiResponseGenerator: ResponseGenerator<LegacyGenerationOptions> = {
  async stream({ history, generation }, callbacks, signal) {
    const currentText = history.filter(message => message.role === "user").at(-1)?.content || "";
    const workflow = skillInstructions(currentText, [...BUILTIN_SKILLS, ...useSkillsStore.getState().custom]);
    const cleanHistory = history.map(message => message.role === "assistant"
      ? { ...message, content: splitSearchSources(message.content).text }
      : message);
    const payload = buildChatPayload(
      generation.mode,
      cleanHistory,
      [generation.systemExtra, workflow].filter(Boolean).join("\n\n"),
      generation.memory,
      false,
      generation.modelId,
      generation.designMode,
      generation.webSearch,
    );
    await streamChatCompletion(generation.modelId, payload, callbacks, signal, {
      temperature: generation.temperature,
      maxTokens: generation.maxTokens,
      conversationId: history.at(-1)?.conversation_id,
      scope: generation.mode,
      webSearch: generation.webSearch,
    });
  },
};
