import {
  createConversation,
  deleteConversation,
  deleteMessage,
  insertMessage,
  listConversations,
  listMessages,
  logTokenUsage,
  renameConversation,
  setConversationPinned,
  setConversationProject,
  setConversationUnread,
  updateConversationLeaf,
  updateMessageContent,
} from "../../db";
import type { ConversationRepository } from "../contracts";

/** Existing local persistence behind the Conversation Engine repository port. */
export const localConversationRepository: ConversationRepository = {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  setConversationProject,
  setConversationPinned,
  setConversationUnread,
  setActiveLeaf: updateConversationLeaf,
  listMessages,
  insertMessage,
  updateMessage: updateMessageContent,
  deleteMessage,
  recordUsage: async (usage) => {
    await logTokenUsage(usage);
  },
};
