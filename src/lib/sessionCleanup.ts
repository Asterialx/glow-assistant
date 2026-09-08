import { clearLocalWorkspace } from "../db";
import { useChatStore } from "../stores/chatStore";
import { useUiStore } from "../stores/uiStore";

/** Reset local UI + cached chats after sign-out (cloud data stays for next login). */
export async function resetLocalSessionAfterSignOut() {
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
    localStorage.removeItem("glow.sync.cursors");
    localStorage.removeItem("glow.sync.lastAt");
  } catch {
    /* ignore */
  }
  try {
    await clearLocalWorkspace("home");
  } catch {
    /* DB may be unavailable in pure web edge cases */
  }
}
