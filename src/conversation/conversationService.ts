import { uid, nowMs } from "../lib/utils";
import { ConversationEngine } from "./ConversationEngine";
import { localConversationRepository } from "./adapters/localConversationRepository";
import {
  smartApiResponseGenerator,
  type LegacyGenerationOptions,
} from "./adapters/smartApiResponseGenerator";

/** Application entry point used by the legacy UI during the incremental migration. */
export const conversationService = new ConversationEngine(
  localConversationRepository,
  smartApiResponseGenerator,
  uid,
  nowMs,
);

export type { LegacyGenerationOptions };
