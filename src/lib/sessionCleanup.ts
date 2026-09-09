import { clearLocalWorkspace } from "../db";
import { useChatStore } from "../stores/chatStore";
import { useUiStore } from "../stores/uiStore";
import { clearSyncCursors, invalidateSyncGeneration } from "./supabase/syncClient";

/** Reset local UI + cached chats after sign-out (cloud data stays for next login). */
export async function resetLocalSessionAfterSignOut() {
  // Cancel in-flight sync so it cannot rewrite cursors onto an empty workspace.
  invalidateSyncGeneration();
  clearSyncCursors();

  useUiStore.getState().setUserName("Guest");
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    branchPath: [],
    projects: [],
    activeProjectId: null,
    artifacts: [],
    activeArtifactId: null,
    draft: "",
    streaming: false,
    panel: "chat",
  });
  useUiStore.getState().closeArtifacts();
  try {
    await clearLocalWorkspace("home");
  } catch {
    /* DB may be unavailable in pure web edge cases */
  }
}
