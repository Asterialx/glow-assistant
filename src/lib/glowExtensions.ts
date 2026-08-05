import { useChatStore } from "../stores/chatStore";
import { useModeStore } from "../stores/modeStore";
import { useUiStore } from "../stores/uiStore";
import { openChromeBrowser, setMcpEnabled } from "./tauri";
import { nowMs, uid } from "./utils";
import type { Artifact, Message } from "./types";
import {
  createConversation,
  insertMessage,
  listConversations,
  updateConversationLeaf,
} from "../db";

/** Enable Chrome agent + open a confirmation chat. */
export async function enableChromeAgent(): Promise<void> {
  const mode = useModeStore.getState().mode;
  const locale = useUiStore.getState().locale;
  const ru = locale === "ru";
  const {
    activeProjectId,
    setConversations,
    setActiveConversationId,
    setMessages,
    setBranchPath,
  } = useChatStore.getState();

  await setMcpEnabled("chrome", true);
  useModeStore.getState().setChromeAgentActive(true);
  try {
    const { useExtensionsStore } = await import("./extensions/registry");
    await useExtensionsStore.getState().install("chrome");
  } catch {
    /* ignore */
  }
  const ok = await openChromeBrowser("https://www.google.com");

  const conv = await createConversation(mode, activeProjectId, "Chrome Agent");
  const notice: Message = {
    id: uid(),
    conversation_id: conv.id,
    parent_id: null,
    role: "assistant",
    content: ok
      ? ru
        ? "✓ **Chrome Agent** открыт и подключён.\n\nБраузер запущен. Могу навигировать по сайтам, кликать кнопки и заполнять формы — опиши задачу."
        : "✓ **Chrome Agent** is open and connected.\n\nChrome has launched. I can navigate, click, and fill forms — tell me what to do."
      : ru
        ? "✓ **Chrome Agent** включён.\n\nНе удалось автозапустить Chrome — открой его вручную, затем опиши задачу для агента."
        : "✓ **Chrome Agent** is enabled.\n\nCouldn’t auto-launch Chrome — open it manually, then tell me what to do.",
    model_id: null,
    status: "done",
    created_at: nowMs(),
  };
  await insertMessage(mode, notice);
  await updateConversationLeaf(mode, conv.id, notice.id);
  setConversations(await listConversations(mode));
  setActiveConversationId(conv.id);
  setMessages([notice]);
  setBranchPath([notice]);
  useUiStore.getState().setAppsOpen(false);
}

/** Turn on Design mode + seed HTML preview artifact. */
export function enableGlowDesign(): void {
  const locale = useUiStore.getState().locale;
  const ru = locale === "ru";
  const {
    artifacts,
    activeConversationId,
    setDraft,
    setArtifacts,
    setActiveArtifactId,
  } = useChatStore.getState();

  useModeStore.getState().setMode("home");
  useModeStore.getState().setDesignMode(true);

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Glow Design</title>
<style>
  :root{--bg:#f4f1ec;--ink:#1c1917;--accent:#c96442;--card:#fff}
  *{box-sizing:border-box} body{margin:0;font-family:Georgia,serif;background:linear-gradient(160deg,#f4f1ec,#e8e2d9);color:var(--ink);min-height:100vh}
  header{padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  .brand{font-weight:700;letter-spacing:-.02em} .badge{font-size:11px;background:#dbeafe;color:#1d4ed8;padding:4px 8px;border-radius:999px}
  main{max-width:720px;margin:0 auto;padding:24px 32px 64px}
  h1{font-size:clamp(2rem,5vw,3rem);line-height:1.1;margin:0 0 12px;letter-spacing:-.03em}
  p{font-size:1.05rem;line-height:1.55;opacity:.85}
  .cta{margin-top:28px;display:flex;gap:10px;flex-wrap:wrap}
  button{border:0;border-radius:14px;padding:12px 18px;font:inherit;cursor:pointer}
  .primary{background:var(--accent);color:#fff} .ghost{background:var(--card);border:1px solid #ddd}
  .card{margin-top:36px;background:var(--card);border-radius:20px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.06)}
</style></head><body>
<header><div class="brand">Glow Design</div><span class="badge">Beta</span></header>
<main>
  <h1>Clickable prototype</h1>
  <p>Replace this layout with your product story. One brand, one headline, one CTA.</p>
  <div class="cta">
    <button class="primary" onclick="document.getElementById('out').textContent='CTA works ✓ '+new Date().toLocaleTimeString()">Primary action</button>
    <button class="ghost" onclick="document.getElementById('out').textContent='Secondary path'">Secondary</button>
  </div>
  <div class="card" id="out">Ready for Design & Reflect.</div>
</main>
</body></html>`;

  const art: Artifact = {
    id: uid(),
    conversation_id: activeConversationId || "local",
    message_id: null,
    kind: "html",
    title: "Glow Design prototype",
    content_path: null,
    content_text: html,
    meta_json: JSON.stringify({ source: "glow-design", preview: "desktop", design: true }),
    created_at: nowMs(),
  };
  setArtifacts([art, ...artifacts]);
  setActiveArtifactId(art.id);
  useUiStore.getState().openArtifacts();
  useUiStore.getState().setArtifactsWidth(Math.max(useUiStore.getState().artifactsWidth, 480));
  setDraft(
    ru
      ? "Сделай лендинг для кофейни: сильный бренд, один CTA, адаптив."
      : "Build a café landing page: strong brand, one CTA, responsive.",
  );
  useUiStore.getState().setAppsOpen(false);
}
