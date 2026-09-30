import { buildChatPayload, streamChatCompletion } from "../../lib/llm/smartapi";
import type { ResponseGenerator } from "../contracts";

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
    const payload = buildChatPayload(
      generation.mode,
      history,
      generation.systemExtra,
      generation.memory,
      false,
      generation.modelId,
      generation.designMode,
      generation.webSearch,
    );
    await streamChatCompletion(generation.modelId, payload, callbacks, signal, {
      temperature: generation.temperature,
      maxTokens: generation.maxTokens,
    });
  },
};
