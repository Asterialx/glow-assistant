import { useEffect, useState } from "react";
import { ChatPane } from "../chat/ChatPane";
import { ArtifactsPanel } from "../artifacts/ArtifactsPanel";
import { ClaudeSidebar } from "./ClaudeSidebar";
import { SettingsModal } from "../settings/SettingsModal";
import { AppsAndExtensions } from "../apps/AppsAndExtensions";
import { useModeStore } from "../../stores/modeStore";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";
import {
  addMemory,
  bootstrapDatabases,
  deleteWidgetsForMessage,
  listArtifacts,
  listArtifactRevisions,
  listMemory,
  listProjects,
  listWidgets,
  restoreArtifactRevision,
  saveArtifact,
  snapshotArtifactRevision,
  updateArtifact,
  upsertWidget,
} from "../../db";
import { onGameMode, redactPii, setMcpEnabled } from "../../lib/tauri";
import { extractPdfText, fileToBase64 } from "../../lib/pdfExtract";
import { nowMs, uid } from "../../lib/utils";
import type { Artifact, ArtifactRevision, Message, UiWidget } from "../../lib/types";
import { extractHtmlArtifact, htmlArtifactTitle, isLabLikeHtml } from "../../lib/artifactDisplay";
import { htmlPresentation, isInlineHtmlArtifact } from "../../lib/htmlArtifact";
import { extractGenUiBlocks, genUiTitle, isArtifactEditRequest, requestedChartType, validateGenUiBlock } from "../../lib/genUi";
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
import { conversationService, type LegacyGenerationOptions } from "../../conversation/conversationService";
import { cloudDataEnabled } from "../../db";
import { watchCloudChanges } from "../../db/cloudSync";

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

  const {
    activeConversationId,
    branchPath,
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
  } = useChatStore();

  const [widgetsByMessage, setWidgetsByMessage] = useState<Record<string, UiWidget[]>>({});
  const [artifactRevisions, setArtifactRevisions] = useState<Record<string, ArtifactRevision[]>>({});
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    if (!ready || !cloudDataEnabled) return;
    return watchCloudChanges(mode, async () => {
      if (conversationService.getState().streaming) return false;
      const active = conversationService.getState().activeConversationId;
      const conversations = await conversationService.refresh(mode);
      setProjects(await listProjects(mode));
      if (active && conversations.some(item => item.id === active)) await loadConversation(active);
      else if (active) { conversationService.startNew(); setArtifacts([]); setWidgetsByMessage({}); }
    }, setSyncError);
  }, [ready, mode]);

  useEffect(() => {
    if (syncError) console.warn(syncError);
  }, [syncError]);

  const reloadConversations = async () => {
    return conversationService.refresh(mode);
  };

  const loadConversation = async (id: string) => {
    await conversationService.select(mode, id);
    const arts = await listArtifacts(mode, id);
    setArtifacts(arts);
    const activeId = useChatStore.getState().activeArtifactId;
    setActiveArtifactId(
      arts.some((artifact) => artifact.id === activeId) ? activeId : arts[0]?.id || null,
    );
    const revisions = await Promise.all(
      arts.map(async (artifact) => [artifact.id, await listArtifactRevisions(mode, artifact.id)] as const),
    );
    setArtifactRevisions(Object.fromEntries(revisions));
    if (arts.length === 0) useUiStore.getState().closeArtifacts();
    const map: Record<string, UiWidget[]> = {};
    for (const m of conversationService.getState().messages) {
      map[m.id] = await listWidgets(mode, m.id);
    }
    setWidgetsByMessage(map);
  };

  useEffect(() => {
    return conversationService.subscribe((state) => {
      setConversations(state.conversations);
      setActiveConversationId(state.activeConversationId);
      setMessages(state.messages);
      setBranchPath(state.branchPath);
      useChatStore.getState().setStreaming(state.streaming);
    });
  }, [conversationService, setActiveConversationId, setBranchPath, setConversations, setMessages]);

  useEffect(() => {
    (async () => {
      await bootstrapDatabases();
      await hydrateExtensionMcp();
      setReady(true);
    })().catch(() => setSyncError("Не удалось открыть хранилище. Проверьте соединение и обновите страницу."));
    onGameMode((s) => setGameModeActive(s.active));
  }, [setGameModeActive]);

  // A sidebar must never consume the narrow chat column. On compact screens it
  // starts closed and, when requested, is rendered as an overlay below.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnCompactScreen = () => {
      if (!desktop.matches) setSidebarOpen(false);
    };
    closeOnCompactScreen();
    desktop.addEventListener("change", closeOnCompactScreen);
    return () => desktop.removeEventListener("change", closeOnCompactScreen);
  }, [setSidebarOpen]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const list = await reloadConversations();
      const projs = await listProjects(mode);
      setProjects(projs);
      // Empty-first Claude style: don't auto-open last chat on mode switch if none selected
      conversationService.startNew();
      setArtifacts([]);
      setActiveArtifactId(null);
      setArtifactRevisions({});
      useUiStore.getState().closeArtifacts();
      void list;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  const ensureConversation = async () => {
    return (await conversationService.ensureConversation(mode, activeProjectId)).id;
  };

  const createGenerationOptions = async (userText = ""): Promise<LegacyGenerationOptions> => {
    const project = projects.find((item) => item.id === activeProjectId);
    const activeArtifact = useChatStore.getState().artifacts.find(
      (artifact) => artifact.id === useChatStore.getState().activeArtifactId,
    );
    const replacementFormat =
      activeArtifact?.kind === "html"
        ? "Return the complete replacement inside one ```html fence."
        : activeArtifact?.kind === "genui"
          ? "Return the complete replacement as one validated ```glow-ui JSON block, keeping a compatible block type when possible."
          : "Return the complete replacement in the same code/Jupyter format as the active artifact.";
    const artifactContext =
      activeArtifact &&
      activeArtifact.conversation_id === activeConversationId &&
      isArtifactEditRequest(userText)
        ? `The user is explicitly modifying the active artifact (id: ${activeArtifact.id}, type: ${activeArtifact.kind}). Preserve that artifact identity and return a complete replacement, not a new independent artifact. ${replacementFormat} Existing content:\n${(activeArtifact.content_text || "").slice(0, 8000)}`
        : "";
    const custom = localStorage.getItem("glow.instructions") || "";
    const memory = memoryPaused ? [] : (await listMemory()).map((item) => item.fact);
    const feedback = feedbackPreferenceHints();
    const extensions = useExtensionsStore.getState().capabilityHints();
    return {
      mode,
      modelId: selectedModelId,
      temperature,
      maxTokens,
      systemExtra: [project?.system_prompt, custom, feedback, extensions, artifactContext].filter(Boolean).join("\n\n"),
      memory,
      designMode,
      webSearch,
    };
  };

  const extractMemory = async (assistantText: string) => {
    if (memoryPaused || gameModeActive) return;
    const facts = assistantText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(remember|fact)\s*:/i.test(l))
      .map((l) => l.replace(/^(remember|fact)\s*:/i, "").trim())
      .filter(Boolean);
    for (const f of facts.slice(0, 3)) await addMemory(f, mode, 0.8);
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
    const genUiBlocks = designMode ? [] : extractGenUiBlocks(text);
    const htmlMatch = extractHtmlArtifact(text);
    const jupyterMatch = text.match(/```(?:jupyter|python-cell)\b[^\n]*\n([\s\S]*?)```/i);
    const codeArt = designMode ? null : extractCodeArtifact(text);
    const created: Artifact[] = [];
    const activeArtifact = useChatStore.getState().artifacts.find(
      (artifact) => artifact.id === useChatStore.getState().activeArtifactId,
    );
    const updateTarget =
      activeArtifact?.conversation_id === convId &&
      ["genui", "html", "code", "jupyter"].includes(activeArtifact.kind) &&
      isArtifactEditRequest(userHint)
        ? activeArtifact
        : null;
    let updatedExisting = false;
    const persistGeneratedArtifact = async (candidate: Artifact) => {
      if (updateTarget && !updatedExisting) {
        const updated = {
          ...candidate,
          id: updateTarget.id,
          conversation_id: updateTarget.conversation_id,
          created_at: updateTarget.created_at,
        };
        await snapshotArtifactRevision(mode, updateTarget, messageId);
        await updateArtifact(mode, updated);
        created.push(updated);
        updatedExisting = true;
      } else {
        await saveArtifact(mode, candidate);
        created.push(candidate);
      }
    };

    for (const block of genUiBlocks) {
      const art: Artifact = {
        id: uid(),
        conversation_id: convId,
        message_id: messageId,
        kind: "genui",
        title: genUiTitle(block),
        content_path: null,
        content_text: JSON.stringify(block),
        meta_json: JSON.stringify({ schema: "glow-ui/v1", componentType: block.type }),
        created_at: nowMs(),
      };
      await persistGeneratedArtifact(art);
    }

    // Never publish a truncated document as a working artifact. A closed
    // fence alone is not enough when the model started a full HTML document.
    if (htmlMatch?.complete) {
      const htmlBody = htmlMatch.body;
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
            presentation: designMode ? "workspace" : htmlPresentation(htmlBody),
          }),
          created_at: nowMs(),
        };
        await persistGeneratedArtifact(art);
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
      await persistGeneratedArtifact(art);
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
      await persistGeneratedArtifact(art);
    }

    if (created.length) {
      const artifactsEnabled = localStorage.getItem("glow.capArtifacts") !== "0";
      const createdIds = new Set(created.map((artifact) => artifact.id));
      setArtifacts([
        ...created,
        ...useChatStore.getState().artifacts.filter((artifact) => !createdIds.has(artifact.id)),
      ]);
      setActiveArtifactId(created[0].id);
      // Compact GenUI blocks stay inline; only larger artifacts open Workspace automatically.
      if (created.some((artifact) => artifact.kind !== "genui" && !isInlineHtmlArtifact(artifact)) && (artifactsEnabled || designMode)) {
        openArtifacts();
      }
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
    const localChartType = !files?.length ? requestedChartType(text) : null;
    const activeArtifact = useChatStore.getState().artifacts.find(
      (artifact) => artifact.id === useChatStore.getState().activeArtifactId,
    );
    if (
      localChartType &&
      activeArtifact?.kind === "genui" &&
      activeArtifact.conversation_id === activeConversationId
    ) {
      try {
        const block = validateGenUiBlock(JSON.parse(activeArtifact.content_text || "null"));
        if (block?.type === "chart") {
          useUiStore.getState().setArtifactViewState(activeArtifact.id, { chartType: localChartType });
          return;
        }
      } catch {
        // Invalid stored UI falls back to the normal conversation path.
      }
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

    if (mode === "med") {
      content = (await redactPii(content)).text;
    }

    const result = await conversationService.send({
      scope: mode,
      conversationId: convId,
      content,
      modelId: selectedModelId,
      generation: await createGenerationOptions(text),
      ...(parentOverride !== undefined ? { parentId } : {}),
      titleSource: text,
    });
    if (!result) return;
    if (!result.error) {
      await maybeSpawnArtifacts(convId, result.assistantMessage.id, result.assistantMessage.content, text);
      await extractMemory(result.assistantMessage.content);
    }
    await loadConversation(convId);
  };

  /** Re-run assistant reply under the same user message (new branch leaf). */
  const handleRegenerate = async (assistantMessage: Message) => {
    const userMessage = conversationService
      .getState()
      .messages.find((message) => message.id === assistantMessage.parent_id);
    const result = await conversationService.regenerate({
      scope: mode,
      assistantMessage,
      modelId: selectedModelId,
      generation: await createGenerationOptions(userMessage?.content || ""),
    });
    if (!result) return;
    if (!result.error) {
      await maybeSpawnArtifacts(
        result.conversationId,
        result.assistantMessage.id,
        result.assistantMessage.content,
        userMessage?.content || "",
      );
      await extractMemory(result.assistantMessage.content);
    }
    await loadConversation(result.conversationId);
  };

  const handleEditBranch = async (message: Message, editedText: string) => {
    let content = editedText.trim();
    if (mode === "med") content = (await redactPii(content)).text;
    const result = await conversationService.editAndResend({
      scope: mode,
      editedMessage: message,
      content,
      modelId: selectedModelId,
      generation: await createGenerationOptions(editedText),
      conversationId: message.conversation_id,
      parentId: message.parent_id,
      titleSource: editedText,
    });
    if (!result) return;
    if (!result.error) {
      await maybeSpawnArtifacts(
        result.conversationId,
        result.assistantMessage.id,
        result.assistantMessage.content,
        editedText,
      );
      await extractMemory(result.assistantMessage.content);
    }
    await loadConversation(result.conversationId);
  };

  const handleRestoreArtifactRevision = async (artifactId: string, revisionId: string) => {
    const restored = await restoreArtifactRevision(mode, artifactId, revisionId);
    if (!restored) return;
    const [nextArtifacts, nextRevisions] = await Promise.all([
      listArtifacts(mode, restored.conversation_id),
      listArtifactRevisions(mode, artifactId),
    ]);
    setArtifacts(nextArtifacts);
    setArtifactRevisions((previous) => ({ ...previous, [artifactId]: nextRevisions }));
    setActiveArtifactId(artifactId);
  };

  return (
    <div className="flex h-full bg-[var(--bg)] text-[var(--fg)]">
      {syncError && <div role="status" className="fixed left-1/2 top-12 z-[110] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm">{syncError}</div>}
      {sidebarOpen && (
        <>
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-black/35 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-40 shadow-2xl md:static md:z-auto md:shadow-none">
            <ClaudeSidebar
              onNewChat={async () => {
                conversationService.startNew();
                setArtifacts([]);
                useUiStore.getState().closeArtifacts();
              }}
              onSelectConversation={async (id) => {
                await loadConversation(id);
              }}
              onProjectsChanged={async () => setProjects(await listProjects(mode))}
              onConversationsChanged={async () => {
                await reloadConversations();
              }}
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1 px-2">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
            onClick={() => setSettingsOpen(true)}
            aria-label="Search / settings"
          >
            <Search size={16} strokeWidth={1.7} />
          </button>
          {gameModeActive && (
            <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] text-[var(--accent)]">
              Game Mode
            </span>
          )}
          {designMode && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#dbeafe] py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-[#1d4ed8]">
              Design mode
              <button
                type="button"
                onClick={() => setDesignMode(false)}
                className="rounded-full p-0.5 hover:bg-[#93c5fd]/50"
                title="Turn off Design mode"
                aria-label="Disable Design mode"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            </span>
          )}
          {chromeAgentActive && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-0.5 pl-2.5 pr-1 text-[11px] text-[var(--accent)]">
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

        <div className="flex min-h-0 flex-1">
          <ChatPane
            messages={branchPath}
            widgetsByMessage={widgetsByMessage}
            artifacts={artifacts}
            onOpenArtifact={(id) => {
              setActiveArtifactId(id);
              openArtifacts();
            }}
            onEditMessage={handleEditBranch}
            onRegenerate={handleRegenerate}
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
            streaming={streaming}
            onStop={() => conversationService.stopGeneration()}
          />
          {artifactsOpen && (
            <ArtifactsPanel
              artifacts={artifacts}
              activeId={activeArtifactId}
              onSelect={setActiveArtifactId}
              onSend={(text) => void handleSend(text)}
              revisionsByArtifact={artifactRevisions}
              onRestoreRevision={handleRestoreArtifactRevision}
            />
          )}
        </div>
      </div>

      <SettingsModal />
      <AppsAndExtensions />
    </div>
  );
}
import { accountStorage as localStorage } from "../../auth/accountStorage";
