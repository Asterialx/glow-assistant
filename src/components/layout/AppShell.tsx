import { useEffect, useRef, useState } from "react";
import { ChatPane } from "../chat/ChatPane";
import { ArtifactsPanel } from "../artifacts/ArtifactsPanel";
import { ClaudeSidebar } from "./ClaudeSidebar";
import { SettingsModal } from "../settings/SettingsModal";
import { AppsAndExtensions } from "../apps/AppsAndExtensions";
import { AuthModal } from "../auth/AuthModal";
import { useModeStore } from "../../stores/modeStore";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { checkGuestMessageAllowed } from "../../lib/supabase/trial";
import { requestLiveSync, startLiveChatSync, syncAndHydrateWorkspace } from "../../lib/supabase/syncClient";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import {
  addMemory,
  bootstrapDatabases,
  createConversation,
  deleteWidgetsForMessage,
  insertMessage,
  listArtifacts,
  listConversations,
  listMemory,
  listMessages,
  listProjects,
  listWidgets,
  logTokenUsage,
  pathToLeaf,
  saveArtifact,
  updateConversationLeaf,
  updateMessageContent,
  upsertWidget,
  renameConversation,
} from "../../db";
import { buildChatPayload, streamChatCompletion } from "../../lib/llm/smartapi";
import { onGameMode, setMcpEnabled } from "../../lib/tauri";
import { extractPdfText, fileToBase64 } from "../../lib/pdfExtract";
import { isDefaultChatTitle, nowMs, titleFromFirstMessage, uid } from "../../lib/utils";
import type { Artifact, Message, UiWidget } from "../../lib/types";
import { htmlArtifactTitle, isLabLikeHtml } from "../../lib/artifactDisplay";
import { detectDesignFrame } from "../../lib/designMode";
import {
  extractAllWidgetPayloads,
  extractCodeArtifact,
  payloadsToWidgets,
  syncStudyProgress,
} from "../../lib/widgetParse";
import { PanelLeft, Search, X } from "lucide-react";
import { feedbackPreferenceHints } from "../../lib/feedbackProfile";
import { hydrateExtensionMcp, useExtensionsStore } from "../../lib/extensions/registry";
import { useIsMobile } from "../../lib/useMediaQuery";
import { cn } from "../../lib/utils";

export function AppShell() {
  const mode = useModeStore((s) => s.mode);
  const gameModeActive = useModeStore((s) => s.gameModeActive);
  const setGameModeActive = useModeStore((s) => s.setGameModeActive);
  const memoryPaused = useModeStore((s) => s.memoryPaused);
  const designMode = useModeStore((s) => s.designMode);
  const chromeAgentActive = useModeStore((s) => s.chromeAgentActive);
  const webSearch = useModeStore((s) => s.webSearch);
  const setDesignMode = useModeStore((s) => s.setDesignMode);
  const setChromeAgentActive = useModeStore((s) => s.setChromeAgentActive);

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const artifactsOpen = useUiStore((s) => s.artifactsOpen);
  const openArtifacts = useUiStore((s) => s.openArtifacts);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const isMobile = useIsMobile();

  const {
    activeConversationId,
    branchPath,
    messages: treeMessages,
    projects,
    activeProjectId,
    selectedModelId,
    temperature,
    maxTokens,
    artifacts,
    activeArtifactId,
    streaming,
    setConversations,
    setActiveConversationId,
    setMessages,
    setBranchPath,
    setProjects,
    setArtifacts,
    setActiveArtifactId,
    setStreaming,
    appendStreamingToken,
  } = useChatStore();

  const [widgetsByMessage, setWidgetsByMessage] = useState<Record<string, UiWidget[]>>({});
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authReason, setAuthReason] = useState<"manual" | "guest_limit">("manual");
  const streamAbortRef = useRef<AbortController | null>(null);

  const openAuth = (mode: "login" | "register", reason: "manual" | "guest_limit" = "manual") => {
    setAuthMode(mode);
    setAuthReason(reason);
    setAuthOpen(true);
  };

  const reloadConversations = async () => {
    const list = await listConversations(mode);
    setConversations(list);
    return list;
  };

  const loadConversation = async (id: string) => {
    const msgs = await listMessages(mode, id);
    setMessages(msgs);
    const conv = (await listConversations(mode)).find((c) => c.id === id);
    const path = pathToLeaf(msgs, conv?.active_leaf_id ?? msgs.at(-1)?.id ?? null);
    setBranchPath(path);
    const arts = await listArtifacts(mode, id);
    setArtifacts(arts);
    if (arts.length === 0) useUiStore.getState().closeArtifacts();
    const map: Record<string, UiWidget[]> = {};
    for (const m of msgs) {
      map[m.id] = await listWidgets(mode, m.id);
    }
    setWidgetsByMessage(map);
  };

  const authStatus = useAuthStore((s) => s.status);
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const hydratedUserRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      await bootstrapDatabases();
      await hydrateExtensionMcp();
      await useAuthStore.getState().init();
      const authed =
        isSupabaseConfigured() && useAuthStore.getState().status === "authenticated";
      if (authed) {
        const uid = useAuthStore.getState().user?.id ?? null;
        try {
          await syncAndHydrateWorkspace(mode);
          hydratedUserRef.current = uid;
        } catch (e) {
          console.error("[glow] initial sync failed:", e);
        }
      }
      setReady(true);
    })();
    onGameMode((s) => setGameModeActive(s.active));
  }, [setGameModeActive, mode]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus !== "authenticated" || !authUserId) {
      if (authStatus === "anon" || authStatus === "unavailable") {
        hydratedUserRef.current = null;
      }
      return;
    }
    // Already hydrated during boot (or this login was handled).
    if (hydratedUserRef.current === authUserId) return;
    hydratedUserRef.current = authUserId;
    let cancelled = false;
    (async () => {
      try {
        await syncAndHydrateWorkspace(mode);
      } catch (e) {
        console.error("[glow] sync on login failed:", e);
        useAuthStore.setState({
          error:
            e instanceof Error
              ? e.message
              : "Sync failed — check Supabase SQL migration.",
        });
      }
      if (cancelled) return;
      const list = await listConversations(mode);
      setConversations(list);
      setProjects(await listProjects(mode));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authStatus, authUserId, mode, setConversations, setProjects]);

  useEffect(() => {
    if (!ready || !isSupabaseConfigured()) return;
    if (authStatus !== "authenticated" || !authUserId) return;

    const stop = startLiveChatSync(mode, (pulled) => {
      if (pulled <= 0) return;
      void (async () => {
        const list = await listConversations(mode);
        setConversations(list);
        setProjects(await listProjects(mode));
        const activeId = useChatStore.getState().activeConversationId;
        const streamingNow = useChatStore.getState().streaming;
        if (activeId && !list.some((c) => c.id === activeId)) {
          setActiveConversationId(null);
          setMessages([]);
          setBranchPath([]);
          setArtifacts([]);
          useUiStore.getState().closeArtifacts();
          return;
        }
        // Don't clobber an in-progress stream on this device.
        if (activeId && !streamingNow) {
          await loadConversation(activeId);
        }
      })();
    });

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authStatus, authUserId, mode, setConversations, setProjects]);

  // Phone: start with sidebar closed; turn off desktop-only modes
  useEffect(() => {
    if (!isMobile) return;
    setSidebarOpen(false);
    setDesignMode(false);
    setChromeAgentActive(false);
    void setMcpEnabled("chrome", false);
  }, [isMobile, setSidebarOpen, setDesignMode, setChromeAgentActive]);

  useEffect(() => {
    if (!ready) return;
    // Signed-in workspace is loaded by syncAndHydrateWorkspace below.
    if (authStatus === "authenticated") return;
    (async () => {
      const list = await reloadConversations();
      const projs = await listProjects(mode);
      setProjects(projs);
      // Empty-first Claude style: don't auto-open last chat on mode switch if none selected
      setActiveConversationId(null);
      setMessages([]);
      setBranchPath([]);
      setArtifacts([]);
      useUiStore.getState().closeArtifacts();
      void list;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready, authStatus]);

  const ensureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    const c = await createConversation(mode, activeProjectId);
    await reloadConversations();
    setActiveConversationId(c.id);
    return c.id;
  };

  const extractMemory = async (assistantText: string) => {
    if (memoryPaused || gameModeActive) return;
    if (localStorage.getItem("glow.memoryFromChats") !== "1") return;
    const facts = assistantText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(remember|fact)\s*:/i.test(l))
      .map((l) => l.replace(/^(remember|fact)\s*:/i, "").trim())
      .filter(Boolean);
    for (const f of facts.slice(0, 3)) await addMemory(f, mode, 0.8);
  };

  const handleStop = () => {
    streamAbortRef.current?.abort();
  };

  const handleSelectLeaf = async (leafId: string) => {
    if (!activeConversationId || streaming) return;
    await updateConversationLeaf(mode, activeConversationId, leafId);
    await loadConversation(activeConversationId);
  };

  const pushArtifact = (art: Artifact) => {
    setArtifacts([art, ...useChatStore.getState().artifacts]);
    setActiveArtifactId(art.id);
    if (localStorage.getItem("glow.capArtifacts") !== "0") openArtifacts();
  };

  const maybeSpawnArtifacts = async (
    convId: string,
    messageId: string,
    text: string,
    userHint = "",
  ) => {
    // Inline UI first — chat bubble only (never Artifacts)
    const payloads = extractAllWidgetPayloads(text);
    if (payloads.length && !designMode) {
      await deleteWidgetsForMessage(mode, messageId);
      const widgets = syncStudyProgress(payloadsToWidgets(messageId, payloads));
      for (const w of widgets) await upsertWidget(mode, w);
      setWidgetsByMessage((prev) => ({ ...prev, [messageId]: widgets }));
    }
    const hasBiomarkerWidget = payloads.some((p) => p.type === "biomarker_table");

    // Artifacts panel ONLY — never checklists / progress / flashcards / biomarkers
    const htmlMatch = text.match(/```html\b[^\n]*\n([\s\S]*?)```/i);
    const jupyterMatch = text.match(/```(?:jupyter|python-cell)\b[^\n]*\n([\s\S]*?)```/i);
    const codeArt = designMode ? null : extractCodeArtifact(text);
    const created: Artifact[] = [];

    if (htmlMatch) {
      const htmlBody = htmlMatch[1] ?? "";
      // Lab tables belong inline — do not open Artifacts for them
      if (!isLabLikeHtml(htmlBody) && !hasBiomarkerWidget) {
        const frame = designMode
          ? detectDesignFrame(htmlBody, userHint)
          : detectDesignFrame(htmlBody, userHint);
        const art: Artifact = {
          id: uid(),
          conversation_id: convId,
          message_id: messageId,
          kind: "html",
          title: htmlArtifactTitle(htmlBody) || (designMode ? "Design preview" : "HTML preview"),
          content_path: null,
          content_text: htmlBody,
          meta_json: JSON.stringify({
            preview: frame,
            design: designMode,
          }),
          created_at: nowMs(),
        };
        await saveArtifact(mode, art);
        created.push(art);
      }
    }
    if (jupyterMatch) {
      const art: Artifact = {
        id: uid(),
        conversation_id: convId,
        message_id: messageId,
        kind: "jupyter",
        title: "Jupyter cell",
        content_path: null,
        content_text: jupyterMatch[1],
        meta_json: "{}",
        created_at: nowMs(),
      };
      await saveArtifact(mode, art);
      created.push(art);
    } else if (codeArt) {
      const art: Artifact = {
        id: uid(),
        conversation_id: convId,
        message_id: messageId,
        kind: "code",
        title: `Code · ${codeArt.lang}`,
        content_path: null,
        content_text: codeArt.body,
        meta_json: JSON.stringify({ lang: codeArt.lang }),
        created_at: nowMs(),
      };
      await saveArtifact(mode, art);
      created.push(art);
    }

    if (created.length) {
      const artifactsEnabled = localStorage.getItem("glow.capArtifacts") !== "0";
      setArtifacts([...created, ...useChatStore.getState().artifacts]);
      setActiveArtifactId(created[0].id);
      // Design mode always opens live preview
      if (artifactsEnabled || designMode) openArtifacts();
      if (designMode && created[0]?.kind === "html") {
        const frame = detectDesignFrame(created[0].content_text || "", userHint);
        if (frame === "phone") {
          useUiStore.getState().setArtifactsWidth(Math.max(useUiStore.getState().artifactsWidth, 420));
        } else {
          useUiStore.getState().setArtifactsWidth(Math.max(useUiStore.getState().artifactsWidth, 520));
        }
      }
    }
  };

  const handleSend = async (
    text: string,
    files?: File[],
    parentOverride?: string | null,
  ) => {
    if (streaming) return;

    const gate = await checkGuestMessageAllowed();
    if (!gate.allowed) {
      openAuth("register", "guest_limit");
      return;
    }

    const convId = await ensureConversation();
    const parentId =
      parentOverride !== undefined ? parentOverride : (branchPath.at(-1)?.id ?? null);

    let content = text;
    if (files?.length) {
      const names = files.map((f) => f.name).join(", ");
      content = `${content}\n\n[Attached: ${names}]`.trim();
      for (const f of files) {
        if (f.type.startsWith("text") || f.name.endsWith(".md") || f.name.endsWith(".csv") || f.name.endsWith(".txt")) {
          const body = await f.text();
          const art: Artifact = {
            id: uid(),
            conversation_id: convId,
            message_id: null,
            kind: "code",
            title: f.name,
            content_path: null,
            content_text: body.slice(0, 20000),
            meta_json: JSON.stringify({ mime: f.type }),
            created_at: nowMs(),
          };
          await saveArtifact(mode, art);
          pushArtifact(art);
          content += `\n\n[File ${f.name}]\n${body.slice(0, 8000)}`;
        }
        if (f.name.endsWith(".pdf") || f.type === "application/pdf") {
          const pdfExt = useExtensionsStore.getState();
          const allowPdf =
            !pdfExt.isInstalled("pdf-viewer") || pdfExt.isEnabled("pdf-viewer");
          if (allowPdf) {
            try {
              const pdfText = await extractPdfText(f);
              const art: Artifact = {
                id: uid(),
                conversation_id: convId,
                message_id: null,
                kind: "pdf",
                title: f.name,
                content_path: null,
                content_text: pdfText.slice(0, 50000),
                meta_json: "{}",
                created_at: nowMs(),
              };
              await saveArtifact(mode, art);
              pushArtifact(art);
              content += `\n\n[PDF ${f.name}]\n${pdfText.slice(0, 12000)}`;
            } catch (e) {
              content += `\n\n[PDF ${f.name}: extract failed — ${e instanceof Error ? e.message : e}]`;
            }
          } else {
            content += `\n\n[PDF ${f.name}: PDF Viewer extension is Off — enable it in Settings → Extensions]`;
          }
        }
        // Office docs when Word/Excel/PowerPoint extensions are on
        {
          const ext = useExtensionsStore.getState();
          const isDoc =
            /\.(docx?|xlsx?|pptx?)$/i.test(f.name) ||
            /wordprocessingml|spreadsheetml|presentationml|msword|ms-excel|ms-powerpoint/i.test(
              f.type,
            );
          if (isDoc) {
            const kind = /\.pptx?$/i.test(f.name)
              ? "powerpoint"
              : /\.xlsx?$/i.test(f.name)
                ? "excel"
                : "word";
            if (ext.isEnabled(kind as "word" | "excel" | "powerpoint")) {
              try {
                const textBody = await f.text().catch(() => "");
                content += `\n\n[${kind} attachment: ${f.name}${
                  textBody
                    ? `]\n${textBody.slice(0, 4000)}`
                    : " — binary Office file; open via Extensions → Test / Open]"
                }`;
              } catch {
                content += `\n\n[${kind} attachment: ${f.name}]`;
              }
            } else {
              content += `\n\n[Office file ${f.name}: enable the ${kind} extension in Settings → Extensions to work with it]`;
            }
          }
        }
        if (f.type.startsWith("image/")) {
          const b64 = await fileToBase64(f);
          const art: Artifact = {
            id: uid(),
            conversation_id: convId,
            message_id: null,
            kind: "image",
            title: f.name,
            content_path: null,
            // Keep previewable; API sanitize strips huge binary from the chat payload
            content_text: `data:${f.type};base64,${b64}`.slice(0, 2_000_000),
            meta_json: JSON.stringify({ mime: f.type, bytes: f.size }),
            created_at: nowMs(),
          };
          await saveArtifact(mode, art);
          pushArtifact(art);
          content += `\n\n[Image attached: ${f.name}, ${f.type}, ${Math.round(f.size / 1024)}KB. Open Artifacts panel to preview. Describe based on filename/context; full vision depends on model support.]`;
        }
        if (f.name.endsWith(".stl") || f.name.endsWith(".obj")) {
          const isStl = f.name.endsWith(".stl");
          const body = isStl ? await fileToBase64(f) : await f.text();
          const art: Artifact = {
            id: uid(),
            conversation_id: convId,
            message_id: null,
            kind: isStl ? "stl" : "obj",
            title: f.name,
            content_path: null,
            content_text: body.slice(0, 2_000_000),
            meta_json: "{}",
            created_at: nowMs(),
          };
          await saveArtifact(mode, art);
          pushArtifact(art);
        }
        if (f.name.endsWith(".dcm") || f.name.endsWith(".dicom")) {
          const b64 = await fileToBase64(f);
          const art: Artifact = {
            id: uid(),
            conversation_id: convId,
            message_id: null,
            kind: "dcm",
            title: f.name,
            content_path: null,
            content_text: b64,
            meta_json: "{}",
            created_at: nowMs(),
          };
          await saveArtifact(mode, art);
          pushArtifact(art);
        }
        if (f.name.endsWith(".ipynb") || f.name.endsWith(".py")) {
          const body = await f.text();
          const art: Artifact = {
            id: uid(),
            conversation_id: convId,
            message_id: null,
            kind: "jupyter",
            title: f.name,
            content_path: null,
            content_text: body.slice(0, 50000),
            meta_json: "{}",
            created_at: nowMs(),
          };
          await saveArtifact(mode, art);
          pushArtifact(art);
        }
      }
    }

    // Name chat from the first user question (skip if already renamed / branch edit)
    const existing = useChatStore.getState().conversations.find((c) => c.id === convId);
    if ((!existing || isDefaultChatTitle(existing.title)) && parentOverride === undefined) {
      const title = titleFromFirstMessage(text);
      if (title && !isDefaultChatTitle(title)) {
        await renameConversation(mode, convId, title);
        await reloadConversations();
      }
    }

    const userMsg: Message = {
      id: uid(),
      conversation_id: convId,
      parent_id: parentId,
      role: "user",
      content,
      model_id: null,
      status: "done",
      created_at: nowMs(),
    };
    await insertMessage(mode, userMsg);

    // Push only (no pull) while answering — avoids wiping the open chat mid-stream.
    if (useAuthStore.getState().status === "authenticated") {
      void requestLiveSync(mode, { immediate: true, pushOnly: true }).catch(() => null);
    }

    const assistantId = uid();
    const assistantMsg: Message = {
      id: assistantId,
      conversation_id: convId,
      parent_id: userMsg.id,
      role: "assistant",
      content: "",
      model_id: selectedModelId,
      status: "streaming",
      created_at: nowMs(),
    };
    await insertMessage(mode, assistantMsg);
    await updateConversationLeaf(mode, convId, assistantId);

    const msgs = await listMessages(mode, convId);
    setMessages(msgs);
    setBranchPath(pathToLeaf(msgs, assistantId));
    setStreaming(true);

    const project = projects.find((p) => p.id === activeProjectId);
    const custom = localStorage.getItem("glow.instructions") || "";
    const memory = memoryPaused ? [] : (await listMemory()).map((m) => m.fact);
    const feedback = feedbackPreferenceHints();
    const extensions = useExtensionsStore.getState().capabilityHints();
    const systemExtra = [project?.system_prompt, custom, feedback, extensions]
      .filter(Boolean)
      .join("\n\n");
    const payload = buildChatPayload(
      mode,
      pathToLeaf(msgs, assistantId).filter((m) => m.id !== assistantId),
      systemExtra,
      memory,
      false,
      selectedModelId,
      designMode,
      webSearch,
    );

    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;
    await streamChatCompletion(
      selectedModelId,
      payload,
      {
      onToken: (token) => appendStreamingToken(assistantId, token),
      onDone: async (usage) => {
        if (streamAbortRef.current === ac) streamAbortRef.current = null;
        const finalContent =
          useChatStore.getState().branchPath.find((m) => m.id === assistantId)?.content || "";
        await updateMessageContent(mode, assistantId, finalContent, "done");
        await logTokenUsage({
          mode,
          conversation_id: convId,
          message_id: assistantId,
          model_id: selectedModelId,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cost_units: usage.costUnits,
        });
        await maybeSpawnArtifacts(convId, assistantId, finalContent, text);
        await extractMemory(finalContent);
        setStreaming(false);
        await loadConversation(convId);
        await reloadConversations();
        if (useAuthStore.getState().status === "authenticated") {
          void requestLiveSync(mode, { immediate: true, chatsOnly: true }).catch(() => null);
        }
      },
      onError: async (err) => {
        if (streamAbortRef.current === ac) streamAbortRef.current = null;
        await updateMessageContent(mode, assistantId, `Error: ${err.message}`, "error");
        setStreaming(false);
        await loadConversation(convId);
      },
      },
      ac.signal,
      { temperature, maxTokens },
    );
  };

  /** Re-run assistant reply under the same user message (new branch leaf). */
  const handleRegenerate = async (assistantMessage: Message) => {
    if (streaming || assistantMessage.role !== "assistant") return;
    const convId = assistantMessage.conversation_id;
    const parentUserId = assistantMessage.parent_id;
    if (!parentUserId) return;

    const all = await listMessages(mode, convId);
    const userMsg = all.find((m) => m.id === parentUserId && m.role === "user");
    if (!userMsg) return;

    const assistantId = uid();
    const assistantMsg: Message = {
      id: assistantId,
      conversation_id: convId,
      parent_id: parentUserId,
      role: "assistant",
      content: "",
      model_id: selectedModelId,
      status: "streaming",
      created_at: nowMs(),
    };
    await insertMessage(mode, assistantMsg);
    await updateConversationLeaf(mode, convId, assistantId);

    const msgs = await listMessages(mode, convId);
    setMessages(msgs);
    setBranchPath(pathToLeaf(msgs, assistantId));
    setStreaming(true);

    const project = projects.find((p) => p.id === activeProjectId);
    const custom = localStorage.getItem("glow.instructions") || "";
    const memory = memoryPaused ? [] : (await listMemory()).map((m) => m.fact);
    const feedback = feedbackPreferenceHints();
    const extensions = useExtensionsStore.getState().capabilityHints();
    const systemExtra = [project?.system_prompt, custom, feedback, extensions]
      .filter(Boolean)
      .join("\n\n");
    const history = pathToLeaf(msgs, assistantId).filter((m) => m.id !== assistantId);
    const payload = buildChatPayload(
      mode,
      history,
      systemExtra,
      memory,
      false,
      selectedModelId,
      designMode,
      webSearch,
    );

    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;

    await streamChatCompletion(
      selectedModelId,
      payload,
      {
        onToken: (token) => appendStreamingToken(assistantId, token),
        onDone: async (usage) => {
          if (streamAbortRef.current === ac) streamAbortRef.current = null;
          const finalContent =
            useChatStore.getState().branchPath.find((m) => m.id === assistantId)?.content || "";
          await updateMessageContent(mode, assistantId, finalContent, "done");
          await logTokenUsage({
            mode,
            conversation_id: convId,
            message_id: assistantId,
            model_id: selectedModelId,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cost_units: usage.costUnits,
          });
          await maybeSpawnArtifacts(convId, assistantId, finalContent, userMsg.content);
          await extractMemory(finalContent);
          setStreaming(false);
          await loadConversation(convId);
          await reloadConversations();
          if (useAuthStore.getState().status === "authenticated") {
            void requestLiveSync(mode, { immediate: true, chatsOnly: true }).catch(() => null);
          }
        },
        onError: async (err) => {
          if (streamAbortRef.current === ac) streamAbortRef.current = null;
          await updateMessageContent(mode, assistantId, `Error: ${err.message}`, "error");
          setStreaming(false);
          await loadConversation(convId);
        },
      },
      ac.signal,
      { temperature, maxTokens },
    );
  };

  const handleEditBranch = async (message: Message, editedText: string) => {
    const edited = editedText.trim();
    if (!edited || edited === message.content) return;
    // Branch from the parent of the edited user message (do not rely on async setState)
    await updateConversationLeaf(mode, message.conversation_id, message.parent_id);
    const msgs = await listMessages(mode, message.conversation_id);
    setMessages(msgs);
    setBranchPath(pathToLeaf(msgs, message.parent_id));
    setActiveConversationId(message.conversation_id);
    await handleSend(edited, undefined, message.parent_id);
  };

  /** Re-send the same user text as a new branch (for training / alternate replies). */
  const handleResendUser = async (message: Message) => {
    if (streaming || message.role !== "user") return;
    const text = message.content.trim();
    if (!text) return;
    await updateConversationLeaf(mode, message.conversation_id, message.parent_id);
    const msgs = await listMessages(mode, message.conversation_id);
    setMessages(msgs);
    setBranchPath(pathToLeaf(msgs, message.parent_id));
    setActiveConversationId(message.conversation_id);
    await handleSend(text, undefined, message.parent_id);
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg)] text-[var(--fg)]">
      {sidebarOpen && isMobile && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <div
          className={cn(
            isMobile &&
              "fixed inset-y-0 left-0 z-50 h-full max-h-dvh w-[min(288px,86vw)] shadow-2xl pl-[env(safe-area-inset-left,0px)]",
          )}
        >
          <ClaudeSidebar
            onNavigate={() => {
              if (isMobile) setSidebarOpen(false);
            }}
            onOpenAuth={(mode) => openAuth(mode, "manual")}
            onNewChat={async () => {
              setActiveConversationId(null);
              setMessages([]);
              setBranchPath([]);
              setArtifacts([]);
              useUiStore.getState().closeArtifacts();
              if (isMobile) setSidebarOpen(false);
            }}
            onSelectConversation={async (id) => {
              setActiveConversationId(id);
              await loadConversation(id);
              if (isMobile) setSidebarOpen(false);
            }}
            onProjectsChanged={async () => setProjects(await listProjects(mode))}
            onConversationsChanged={async () => {
              await reloadConversations();
            }}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex shrink-0 items-center gap-0.5 px-1.5 sm:h-11 sm:gap-1 sm:px-2",
            isMobile
              ? "min-h-12 pt-[env(safe-area-inset-top,0px)]"
              : "h-12",
          )}
        >
          <button
            type="button"
            className="touch-target rounded-xl p-2.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] sm:rounded-lg sm:p-2"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={isMobile ? 20 : 16} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className="touch-target rounded-xl p-2.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] sm:rounded-lg sm:p-2"
            onClick={() => setSettingsOpen(true)}
            aria-label="Search / settings"
          >
            <Search size={isMobile ? 20 : 16} strokeWidth={1.7} />
          </button>
          {gameModeActive && !isMobile && (
            <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] text-[var(--accent)]">
              Game Mode
            </span>
          )}
          {designMode && !isMobile && (
            <span className="ml-1 inline-flex max-w-[40vw] items-center gap-1 truncate rounded-full bg-[#dbeafe] py-0.5 pl-2 pr-1 text-[11px] font-medium text-[#1d4ed8] sm:ml-2 sm:max-w-none sm:pl-2.5">
              <span className="truncate">Design</span>
              <button
                type="button"
                onClick={() => setDesignMode(false)}
                className="touch-target rounded-full p-1 hover:bg-[#93c5fd]/50 sm:p-0.5"
                title="Turn off Design mode"
                aria-label="Disable Design mode"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            </span>
          )}
          {chromeAgentActive && !isMobile && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-0.5 pl-2.5 pr-1 text-[11px] text-[var(--accent)]">
              Chrome agent
              <button
                type="button"
                onClick={() => {
                  setChromeAgentActive(false);
                  void setMcpEnabled("chrome", false);
                }}
                className="rounded-full p-0.5 hover:bg-black/10"
                title="Turn off Chrome agent"
                aria-label="Disable Chrome agent"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            </span>
          )}
          <div className="ml-auto pr-2 text-[12px] text-[var(--fg-faint)]">Glow</div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <ChatPane
            messages={branchPath}
            treeMessages={treeMessages}
            widgetsByMessage={widgetsByMessage}
            artifacts={artifacts}
            onOpenArtifact={(id) => {
              setActiveArtifactId(id);
              openArtifacts();
            }}
            onEditMessage={handleEditBranch}
            onResend={handleResendUser}
            onRegenerate={handleRegenerate}
            onSelectLeaf={handleSelectLeaf}
            onWidgetChange={async (w) => {
              let nextList = (widgetsByMessage[w.message_id] || []).map((x) =>
                x.id === w.id ? w : x,
              );
              nextList = syncStudyProgress(nextList);
              for (const item of nextList) {
                if (item.id === w.id || item.widget_type === "progress") {
                  await upsertWidget(mode, item);
                }
              }
              setWidgetsByMessage((prev) => ({
                ...prev,
                [w.message_id]: nextList,
              }));
            }}
            onSend={handleSend}
            onStop={handleStop}
            streaming={streaming}
          />
          {artifactsOpen && (
            <div
              className={cn(
                isMobile && "absolute inset-0 z-30 bg-[var(--bg)]",
              )}
            >
              <ArtifactsPanel
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
                fullScreen={isMobile}
              />
            </div>
          )}
        </div>
      </div>

      <SettingsModal />
      {!isMobile && <AppsAndExtensions />}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        reason={authReason}
        initialMode={authMode}
      />
    </div>
  );
}
