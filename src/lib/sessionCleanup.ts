import { switchWorkspaceOwner } from "../db";
import { useChatStore } from "../stores/chatStore";
import { useUiStore } from "../stores/uiStore";
import { clearSyncCursors, clearSyncUserMarker, invalidateSyncGeneration } from "./supabase/syncClient";

/**
 * Reset UI after sign-out. Keeps each user's IndexedDB/SQLite workspace intact
 * (Ai_asisst-style) so the next login shows chats instantly, then cloud merge runs.
 */
export async function resetLocalSessionAfterSignOut() {
  invalidateSyncGeneration();
  clearSyncCursors();
  clearSyncUserMarker();

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
    // Switch to guest workspace — do NOT wipe the signed-out user's local cache.
    await switchWorkspaceOwner(null);
  } catch {
    /* DB may be unavailable in pure web edge cases */
  }
}
