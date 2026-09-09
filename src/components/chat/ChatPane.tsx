import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Artifact, Message, UiWidget } from "../../lib/types";
import { InlineWidgets } from "../widgets/InlineWidgets";
import {
  Pencil,
  Copy,
  Volume2,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  RefreshCw,
  Check,
  X,
  PanelRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { useModeStore } from "../../stores/modeStore";
import { t } from "../../lib/i18n";
import { SmartInputBar } from "../input/SmartInputBar";
import { cn } from "../../lib/utils";
import { getAssistantDisplay } from "../../lib/artifactDisplay";
import { speakText, stopSpeaking, isSpeakingMessage } from "../../lib/tts";
import {
  getFeedbackProfile,
  recordFeedback,
  type FeedbackVote,
} from "../../lib/feedbackProfile";

import { VoiceNotePlayer } from "../audio/VoiceNotePlayer";
import { useIsMobile } from "../../lib/useMediaQuery";

interface Props {
  messages: Message[];
  /** Full message tree for sibling branch navigation */
  treeMessages?: Message[];
  widgetsByMessage?: Record<string, UiWidget[]>;
  artifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
  onEditMessage?: (message: Message, editedText: string) => void;
  onResend?: (message: Message) => void;
  onRegenerate?: (message: Message) => void;
  onSelectLeaf?: (leafId: string) => void;
  onWidgetChange?: (widget: UiWidget) => void;
  onSend: (text: string, files?: File[]) => void;
  onStop?: () => void;
  streaming?: boolean;
}

function assistantSiblings(tree: Message[], m: Message): Message[] {
  if (m.role !== "assistant" || !m.parent_id) return [];
  return tree
    .filter((x) => x.parent_id === m.parent_id && x.role === "assistant")
    .sort((a, b) => a.created_at - b.created_at);
}

/** Themed mini-player for voice notes; hide STT / metadata from the bubble. */
function UserMessageBody({ content }: { content: string }) {
  const blocks: { mime: string; name: string; b64: string }[] = [];
  content.replace(
    /```glow-audio\r?\n([^\n]+)\r?\n([^\n]+)\r?\n([\s\S]*?)```/g,
    (_m, mime: string, name: string, b64: string) => {
      blocks.push({
        mime: mime.trim(),
        name: name.trim(),
        b64: b64.replace(/\s/g, ""),
      });
      return "";
    },
  );

  if (blocks.length > 0) {
    return (
      <div className="flex min-w-0 flex-col gap-2 sm:min-w-[220px]">
        {blocks.map((b, i) => (
          <VoiceNotePlayer
            key={`${b.name}-${i}`}
            src={`data:${b.mime};base64,${b.b64}`}
            compact
          />
        ))}
      </div>
    );
  }

  const cleaned = content
    .replace(/```glow-stt\r?\n[\s\S]*?```/g, "")
    .replace(/<!--glow-stt:[\s\S]*?-->/g, "")
    .replace(/\[Attached:[^\]]*\]/g, "")
    .replace(/\[Voice note:[^\]]*\]/g, "")
    .replace(/\[Voice transcript[^\]]*\]:?\s*/gi, "")
    .trim();

  return cleaned ? (
    <div className="whitespace-pre-wrap break-words">{cleaned}</div>
  ) : null;
}

export function ChatPane({
  messages,
  treeMessages = [],
  widgetsByMessage = {},
  artifacts = [],
  onOpenArtifact,
  onEditMessage,
  onResend,
  onRegenerate,
  onSelectLeaf,
  onWidgetChange,
  onSend,
  onStop,
  streaming,
}: Props) {
  const locale = useUiStore((s) => s.locale);
  const designMode = useModeStore((s) => s.designMode);
  const isMobile = useIsMobile();
  const empty = messages.length === 0;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>(() => getFeedbackProfile().byMessage);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const userActionRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollChatToEnd = (behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
  };

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  useEffect(() => {
    if (empty) return;
    scrollChatToEnd("auto");
  }, [messages, empty, streaming]);

  useEffect(() => {
    if (!isMobile || empty) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewport = () => {
      // After keyboard open/close, keep the latest bubble above the input.
      window.requestAnimationFrame(() => scrollChatToEnd("auto"));
    };
    vv.addEventListener("resize", onViewport);
    vv.addEventListener("scroll", onViewport);
    return () => {
      vv.removeEventListener("resize", onViewport);
      vv.removeEventListener("scroll", onViewport);
    };
  }, [isMobile, empty]);

  useEffect(() => {
    if (!selectedUserId) return;
    const onDoc = (e: MouseEvent) => {
      if (!userActionRef.current?.contains(e.target as Node)) {
        setSelectedUserId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selectedUserId]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (speakingId && !isSpeakingMessage(speakingId)) setSpeakingId(null);
    }, 400);
    return () => {
      window.clearInterval(tick);
      stopSpeaking();
    };
  }, [speakingId]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const startEdit = (m: Message) => {
    if (streaming) return;
    setSelectedUserId(null);
    setEditingId(m.id);
    setEditDraft(m.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = (m: Message) => {
    const next = editDraft.trim();
    if (!next || next === m.content) {
      cancelEdit();
      return;
    }
    setEditingId(null);
    setEditDraft("");
    onEditMessage?.(m, next);
  };

  const toggleSpeak = (id: string, text: string) => {
    const lang = localStorage.getItem("glow.voiceLang") || locale || "en";
    const started = speakText(id, text, lang);
    setSpeakingId(started ? id : null);
  };

  const vote = (m: Message, v: FeedbackVote, text: string) => {
    const profile = recordFeedback({
      messageId: m.id,
      conversationId: m.conversation_id,
      vote: v,
      content: text,
      modelId: m.model_id,
    });
    setVotes({ ...profile.byMessage });
  };

  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "flex flex-1 flex-col items-center px-4 sm:px-6",
            isMobile ? "justify-center pb-4" : "justify-center",
          )}
        >
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-[0.28em] text-[1.75rem] sm:text-[2rem]">
              <img
                src="/glow-mark.png?v=6"
                alt=""
                className="relative top-[0.05em] block h-[0.78em] w-auto shrink-0 object-contain"
              />
              <h1 className="relative top-[0.04em] m-0 font-[family-name:var(--font-display)] text-[1em] font-medium leading-none tracking-[-0.02em] text-[var(--fg)]">
                {t(locale, "greeting")}
              </h1>
            </div>
          </div>
          {!isMobile && (
            <div className="w-full max-w-[720px]">
              <SmartInputBar
                onSend={onSend}
                onStop={onStop}
                disabled={streaming}
                streaming={streaming}
                centered
              />
            </div>
          )}
        </div>
        {isMobile && (
          <div className="w-full shrink-0">
            <SmartInputBar
              onSend={onSend}
              onStop={onStop}
              disabled={streaming}
              streaming={streaming}
              centered
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-5 sm:px-4 md:px-8 md:py-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-6 sm:gap-7">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            const isStreaming = m.status === "streaming";
            const isLast = idx === messages.length - 1;
            const showThinking = !isUser && isStreaming && !m.content;
            const isEditing = editingId === m.id;

            if (isUser) {
              const selected = selectedUserId === m.id;
              return (
                <div key={m.id} className="flex justify-end">
                  <div
                    ref={selected ? userActionRef : undefined}
                    className="relative flex max-w-[min(92%,34rem)] items-center gap-2.5 sm:max-w-[min(85%,34rem)]"
                  >
                    {!isEditing && selected && (
                      <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 shadow-sm">
                        {onEditMessage && (
                          <IconBtn
                            title={locale === "ru" ? "Редактировать" : "Edit"}
                            disabled={!!streaming}
                            onClick={() => startEdit(m)}
                          >
                            <Pencil size={14} strokeWidth={1.6} />
                          </IconBtn>
                        )}
                        {onResend && (
                          <IconBtn
                            title={locale === "ru" ? "Переотправить" : "Resend"}
                            disabled={!!streaming}
                            onClick={() => {
                              setSelectedUserId(null);
                              onResend(m);
                            }}
                          >
                            <RefreshCw size={14} strokeWidth={1.6} />
                          </IconBtn>
                        )}
                      </div>
                    )}
                    {isEditing ? (
                      <div className="min-w-0 w-[min(100%,20rem)] rounded-[22px] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg sm:min-w-[240px]">
                        <textarea
                          ref={editRef}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
                          className="w-full resize-none bg-transparent text-[15.5px] leading-[1.55] text-[var(--fg)] outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              saveEdit(m);
                            }
                          }}
                        />
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                            title="Cancel"
                            onClick={cancelEdit}
                          >
                            <X size={15} />
                          </button>
                          <button
                            type="button"
                            className="flex h-8 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-[12.5px] font-medium text-white hover:opacity-90"
                            onClick={() => saveEdit(m)}
                          >
                            <Check size={14} />
                            {locale === "ru" ? "Сохранить" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={streaming ? -1 : 0}
                        onClick={() => {
                          if (streaming) return;
                          setSelectedUserId((id) => (id === m.id ? null : m.id));
                        }}
                        onKeyDown={(e) => {
                          if (streaming) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedUserId((id) => (id === m.id ? null : m.id));
                          }
                        }}
                        className={cn(
                          "rounded-[22px] bg-[var(--user-bubble)] px-[18px] py-[10px] text-left text-[15.5px] leading-[1.55] text-[var(--fg)] transition-shadow outline-none",
                          selected && "ring-1 ring-[var(--border)]",
                          !streaming && "cursor-pointer",
                        )}
                      >
                        <UserMessageBody content={m.content} />
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const display = getAssistantDisplay(m.content, isStreaming);
            const messageArts = artifacts.filter((a) => a.message_id === m.id);
            const panelArt = messageArts.find((a) =>
              ["html", "jupyter", "code", "stl", "obj", "dcm", "pdf"].includes(a.kind),
            );
            const showBuilding = display.buildingHtml || display.buildingWidget;
            const widgets = widgetsByMessage[m.id] || [];
            const prose =
              display.content ||
              (showBuilding
                ? ""
                : display.hasHtmlArtifact && !isStreaming
                  ? t(locale, "assembledArtifact")
                  : isStreaming
                    ? "…"
                    : "");
            const sibs = assistantSiblings(treeMessages, m);
            const sibIdx = sibs.findIndex((s) => s.id === m.id);

            return (
              <div key={m.id} className="group flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[13px] text-[var(--fg-faint)]">
                  <span className="text-[15px] leading-none text-[var(--accent)]">✻</span>
                  <span>
                    {showThinking
                      ? t(locale, "thinking")
                      : display.buildingHtml
                        ? designMode
                          ? t(locale, "buildingDesign")
                          : t(locale, "buildingArtifact")
                        : display.buildingWidget
                          ? locale === "ru"
                            ? "Собираю виджет…"
                            : "Building widget…"
                          : isStreaming
                            ? t(locale, "writing")
                            : `Glow${m.model_id ? ` · ${m.model_id}` : ""}`}
                  </span>
                </div>

                <div
                  className={cn(
                    "prose-chat max-w-none font-[family-name:var(--font-display)] text-[16.5px] leading-[1.7] text-[var(--fg)]",
                    "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[1.25em] [&_h1]:font-semibold",
                    "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[1.1em] [&_h2]:font-semibold",
                    "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-[1.05em] [&_h3]:font-semibold",
                    "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
                    "[&_strong]:font-semibold",
                  )}
                >
                  {showThinking ? null : prose ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {prose}
                    </ReactMarkdown>
                  ) : null}
                  {display.buildingHtml && (
                    <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
                      {designMode ? t(locale, "buildingDesign") : t(locale, "buildingArtifact")}
                    </p>
                  )}
                  {display.buildingWidget && (
                    <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
                      {locale === "ru" ? "Собираю виджет…" : "Building widget…"}
                    </p>
                  )}

                  {!isStreaming && widgets.length > 0 && (
                    <InlineWidgets widgets={widgets} onChange={onWidgetChange} />
                  )}
                </div>

                {!isStreaming && panelArt && panelArt.kind === "html" && onOpenArtifact && (
                  <button
                    type="button"
                    onClick={() => onOpenArtifact(panelArt.id)}
                    className="mt-1 inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--fg)] shadow-sm transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <PanelRight size={15} strokeWidth={1.7} className="text-[var(--accent)]" />
                    <span>{t(locale, "openArtifact")}</span>
                    {panelArt.title ? (
                      <span className="max-w-[12rem] truncate text-[var(--fg-faint)]">
                        · {panelArt.title}
                      </span>
                    ) : null}
                  </button>
                )}

                {!isStreaming && m.content && !m.content.startsWith("Error:") && (
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-0.5 text-[var(--fg-faint)]",
                      isLast || isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    {sibs.length > 1 && onSelectLeaf && (
                      <div className="mr-1 flex items-center gap-0.5">
                        <IconBtn
                          title={locale === "ru" ? "Предыдущий ответ" : "Previous reply"}
                          disabled={!!streaming || sibIdx <= 0}
                          onClick={() => onSelectLeaf(sibs[sibIdx - 1].id)}
                        >
                          <ChevronLeft size={15} />
                        </IconBtn>
                        <span className="min-w-[2.4rem] text-center text-[11px] tabular-nums text-[var(--fg-muted)]">
                          {sibIdx + 1}/{sibs.length}
                        </span>
                        <IconBtn
                          title={locale === "ru" ? "Следующий ответ" : "Next reply"}
                          disabled={!!streaming || sibIdx >= sibs.length - 1}
                          onClick={() => onSelectLeaf(sibs[sibIdx + 1].id)}
                        >
                          <ChevronRight size={15} />
                        </IconBtn>
                      </div>
                    )}
                    <IconBtn
                      title="Copy"
                      onClick={() => void copyText(m.id, display.content || m.content)}
                    >
                      {copiedId === m.id ? <Check size={15} /> : <Copy size={15} />}
                    </IconBtn>
                    <IconBtn
                      title={speakingId === m.id ? "Stop" : "Read aloud"}
                      active={speakingId === m.id}
                      onClick={() => toggleSpeak(m.id, display.content || m.content)}
                    >
                      <Volume2 size={15} />
                    </IconBtn>
                    <IconBtn
                      title="Helpful"
                      active={votes[m.id] === "up"}
                      onClick={() => vote(m, "up", display.content || m.content)}
                    >
                      <ThumbsUp size={15} />
                    </IconBtn>
                    <IconBtn
                      title="Not helpful"
                      active={votes[m.id] === "down"}
                      onClick={() => vote(m, "down", display.content || m.content)}
                    >
                      <ThumbsDown size={15} />
                    </IconBtn>
                    <IconBtn
                      title="Regenerate"
                      disabled={!!streaming}
                      onClick={() => onRegenerate?.(m)}
                    >
                      <RotateCcw size={15} />
                    </IconBtn>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
        </div>
      </div>
      <SmartInputBar
        onSend={onSend}
        onStop={onStop}
        disabled={streaming}
        streaming={streaming}
        onFocusInput={isMobile ? () => scrollChatToEnd("smooth") : undefined}
      />
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  active,
  disabled,
}: {
  children: ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 hover:bg-[var(--bg-hover)] hover:text-[var(--fg-muted)] disabled:opacity-40",
        active && "bg-[var(--accent-soft)] text-[var(--accent)]",
      )}
    >
      {children}
    </button>
  );
}
