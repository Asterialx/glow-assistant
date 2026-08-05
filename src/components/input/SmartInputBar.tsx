import {
  Plus,
  Mic,
  ChevronDown,
  Check,
  Hand,
  X,
  ArrowUp,
  Globe,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ModelSelector } from "./ModelSelector";
import { PlusActionMenu } from "./PlusActionMenu";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";
import { useModeStore } from "../../stores/modeStore";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import {
  isAppleMobile,
  prefetchSpeechModel,
  resolveSttLang,
  startBestVoiceRecorder,
  startLiveSpeech,
  startVoiceRecorder,
  transcribeAudioBlob,
  type LiveSpeechHandle,
  type VoiceRecorder,
} from "../../lib/speech/transcribeAudio";
import {
  micTrackConstraints,
  openMicAnalyser,
  readRmsLevel,
  type MicAnalyser,
} from "../../lib/speech/micAnalyser";
import { useIsMobile } from "../../lib/useMediaQuery";
import { setMcpEnabled } from "../../lib/tauri";
import { useExtensionsStore } from "../../lib/extensions/registry";

interface Props {
  onSend: (text: string, files?: File[]) => void;
  disabled?: boolean;
  centered?: boolean;
}

const BASE_ACCEPT =
  "image/*,.pdf,.txt,.md,.csv,.json,.stl,.obj,.dcm,.dicom,.ipynb,.py,.ts,.tsx,.js,.jsx,.html,.css";

export function SmartInputBar({ onSend, disabled, centered }: Props) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const locale = useUiStore((s) => s.locale);
  const designMode = useModeStore((s) => s.designMode);
  const setDesignMode = useModeStore((s) => s.setDesignMode);
  const chromeAgentActive = useModeStore((s) => s.chromeAgentActive);
  const setChromeAgentActive = useModeStore((s) => s.setChromeAgentActive);
  const webSearch = useModeStore((s) => s.webSearch);
  const setWebSearch = useModeStore((s) => s.setWebSearch);
  const isMobile = useIsMobile();
  const extAccept = useExtensionsStore((s) => s.enabledAcceptAttr());
  const fileAccept = extAccept ? `${BASE_ACCEPT},${extAccept}` : BASE_ACCEPT;
  const lang = resolveSttLang(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [micOpen, setMicOpen] = useState(false);
  const [micHover, setMicHover] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(
    localStorage.getItem("glow.micDevice") || "",
  );
  const [level, setLevel] = useState(0);
  const [holdToRecord, setHoldToRecord] = useState(
    () => !isMobile && localStorage.getItem("glow.holdToRecord") === "1",
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [liveHint, setLiveHint] = useState("");
  const [engine, setEngine] = useState<"live" | "whisper">("live");

  const micMenuRef = useRef<HTMLDivElement>(null);
  const holdActiveRef = useRef(false);
  const pendingStopRef = useRef(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const liveRef = useRef<LiveSpeechHandle | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewMeterRef = useRef<MicAnalyser | null>(null);
  const rafRef = useRef<number>(0);
  const finalizeRef = useRef<() => void>(() => {});
  const recordingRef = useRef(false);

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text && files.length === 0) return;
    onSend(text, files);
    setDraft("");
    setFiles([]);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        fileRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!micMenuRef.current?.contains(e.target as Node)) {
        setMicOpen(false);
        stopPreviewOnly();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pushLevel = (n: number) => {
    setLevel(n);
  };

  const levelBarRef = useRef<HTMLDivElement>(null);
  const previewGenRef = useRef(0);

  const setMeterWidth = (n: number) => {
    const el = levelBarRef.current;
    if (el) el.style.width = `${Math.round(Math.min(100, Math.max(0, n * 100)))}%`;
    // keep state lightly for any other UI (throttled via assignment is fine)
  };

  const loadDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      return inputs;
    } catch {
      setDevices([]);
      return [] as MediaDeviceInfo[];
    }
  };

  const stopPreviewOnly = () => {
    previewGenRef.current += 1;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    previewMeterRef.current?.stop();
    previewMeterRef.current = null;
    setMeterWidth(0);
    setLevel(0);
  };

  const teardownAudio = () => {
    stopPreviewOnly();
    try {
      liveRef.current?.abort();
    } catch {
      /* ignore */
    }
    liveRef.current = null;
    try {
      recorderRef.current?.abort();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    setLevel(0);
    setLiveHint("");
  };

  const startLevelPreview = async (id?: string) => {
    stopPreviewOnly();
    const gen = previewGenRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micTrackConstraints(id),
      });
      if (gen !== previewGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      previewStreamRef.current = stream;
      void loadDevices();

      try {
        const meter = await openMicAnalyser(stream);
        if (gen !== previewGenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          meter.stop();
          return;
        }
        previewMeterRef.current = meter;

        const data = new Uint8Array(meter.analyser.fftSize);
        const tick = () => {
          if (gen !== previewGenRef.current) return;
          const n = readRmsLevel(meter.analyser, data);
          setMeterWidth(n);
          setLevel(n);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        console.warn("Mic level meter unavailable", e);
      }
    } catch (e) {
      console.warn("Mic level preview failed", e);
      setMeterWidth(0);
      setLevel(0);
    }
  };

  const openDeviceMenu = async () => {
    if (recording || busy) return;
    const next = !micOpen;
    setMicOpen(next);
    if (next) {
      // Open mic first (user gesture) → then list devices with labels
      const preferred = deviceId || undefined;
      await startLevelPreview(preferred);
      const inputs = await loadDevices();
      const id =
        (deviceId && inputs.some((d) => d.deviceId === deviceId) && deviceId) ||
        inputs[0]?.deviceId ||
        preferred;
      if (id && id !== preferred) {
        setDeviceId(id);
        localStorage.setItem("glow.micDevice", id);
        await startLevelPreview(id);
      }
    } else {
      stopPreviewOnly();
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => prefetchSpeechModel(), 2500);
    return () => {
      window.clearTimeout(id);
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Mic → speech-to-text into the input field. */
  const startDictation = async () => {
    if (recording || busy || disabled) return;
    setMicOpen(false);
    pendingStopRef.current = false;
    setLiveHint("");

    const apple = isAppleMobile();
    const micId = apple ? undefined : deviceId || undefined;

    try {
      teardownAudio();

      // Permission warm-up. On Apple release the mic before Web Speech —
      // holding getUserMedia kills speech recognition.
      try {
        const warm = await navigator.mediaDevices.getUserMedia({
          audio: apple ? true : micTrackConstraints(micId),
        });
        warm.getTracks().forEach((t) => t.stop());
      } catch {
        throw new Error("mic");
      }

      const startWhisperFallback = async (hint?: string) => {
        setEngine("whisper");
        prefetchSpeechModel();
        if (hint) setLiveHint(hint);
        if (recorderRef.current) return;
        const rec = await startBestVoiceRecorder(micId, (n) => pushLevel(n));
        if (holdToRecord && pendingStopRef.current) {
          rec.abort();
          pendingStopRef.current = false;
          holdActiveRef.current = false;
          return;
        }
        recorderRef.current = rec;
      };

      const live = startLiveSpeech(
        lang,
        (final, interim) => {
          const shown = (final + (interim ? ` ${interim}` : "")).trim();
          setLiveHint(shown || (locale === "ru" ? "Слушаю…" : "Listening…"));
        },
        (code) => {
          console.warn("Web Speech fatal", code);
          if (!recordingRef.current) return;
          liveRef.current?.abort();
          liveRef.current = null;
          void startWhisperFallback(
            locale === "ru"
              ? "Web Speech недоступен → запись…"
              : "Web Speech unavailable → recording…",
          ).catch(console.error);
        },
      );

      if (live) {
        liveRef.current = live;
        setEngine("live");
        setLiveHint(locale === "ru" ? "Слушаю… говорите" : "Listening… speak");
        // Desktop: also record for Whisper if live returns empty.
        // Apple: NEVER open a second mic stream alongside Web Speech.
        if (!apple) {
          try {
            const rec = await startVoiceRecorder(micId, (n) => pushLevel(n));
            recorderRef.current = rec;
            prefetchSpeechModel();
          } catch (e) {
            console.warn("Backup recorder failed", e);
          }
        } else {
          // Soft level animation so UI isn't frozen while Apple STT runs
          const tick = () => {
            if (!recordingRef.current || recorderRef.current) return;
            setLevel(0.12 + Math.random() * 0.35);
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } else {
        await startWhisperFallback(
          locale === "ru"
            ? isMobile
              ? "Запись… потом нажмите ✓"
              : "Запись… потом ✓ — текст попадёт в поле"
            : isMobile
              ? "Recording… then tap ✓"
              : "Recording… then ✓ — text goes into the input",
        );
      }

      if (holdToRecord && pendingStopRef.current) {
        teardownAudio();
        pendingStopRef.current = false;
        holdActiveRef.current = false;
        return;
      }

      recordingRef.current = true;
      setRecording(true);

      if (holdToRecord && (!holdActiveRef.current || pendingStopRef.current)) {
        pendingStopRef.current = false;
        finalizeRef.current();
      }
    } catch {
      const insecure = typeof window !== "undefined" && !window.isSecureContext;
      alert(
        locale === "ru"
          ? insecure
            ? "Микрофон на телефоне работает только по HTTPS.\nОткрой ссылку cloudflared/ngrok (https://…), не http://192.168…"
            : apple || isMobile
              ? "Нет доступа к микрофону.\nВ Chrome: нажми 🔒 / «i» у адреса → Разрешения → Микрофон → Разрешить.\nВ настройках телефона разрешение для Chrome тоже должно быть включено."
              : "Нет доступа к микрофону. Windows → Параметры → Конфиденциальность → Микрофон."
          : insecure
            ? "Microphone needs HTTPS on phones. Open the cloudflared/ngrok https:// link, not http://192.168…"
            : "Microphone access denied. Check the site permission (lock icon) and Chrome mic settings.",
      );
      teardownAudio();
      recordingRef.current = false;
      setRecording(false);
    }
  };

  const cancelRecording = () => {
    holdActiveRef.current = false;
    pendingStopRef.current = false;
    teardownAudio();
    recordingRef.current = false;
    setRecording(false);
    setBusy(false);
    setBusyLabel("");
    setLiveHint("");
  };

  const finalizeDictation = async () => {
    holdActiveRef.current = false;
    pendingStopRef.current = false;
    if (!recordingRef.current && !recorderRef.current && !liveRef.current) return;

    recordingRef.current = false;
    setRecording(false);
    setBusy(true);
    setBusyLabel(locale === "ru" ? "Распознаю речь…" : "Transcribing…");

    try {
      const live = liveRef.current;
      liveRef.current = null;
      const rec = recorderRef.current;
      recorderRef.current = null;
      let text = "";

      if (live) {
        setBusyLabel(locale === "ru" ? "Собираю текст…" : "Finalizing…");
        text = await live.stop();
      }
      if (!text && rec) {
        const blob = await rec.stop();
        text = await transcribeAudioBlob(blob, lang, (phase) => {
          if (phase === "loading-model") {
            setBusyLabel(
              locale === "ru"
                ? "Загружаю Whisper (первый раз)…"
                : "Loading Whisper…",
            );
          } else {
            setBusyLabel(locale === "ru" ? "Распознаю…" : "Transcribing…");
          }
        });
      } else if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      setLevel(0);
      setBusy(false);
      setBusyLabel("");
      setLiveHint("");

      if (!text) {
        alert(
          locale === "ru"
            ? "Текст не распознан. Говорите громче 2–3 секунды."
            : "No transcript. Speak louder for 2–3 seconds.",
        );
        return;
      }

      const next = (draft ? `${draft.trim()} ${text}` : text).trim();
      setDraft(next);
      requestAnimationFrame(resize);
    } catch (e) {
      console.error(e);
      setBusy(false);
      setBusyLabel("");
      teardownAudio();
      alert(
        e instanceof Error
          ? e.message
          : locale === "ru"
            ? "Ошибка распознавания"
            : "Speech recognition error",
      );
    }
  };
  finalizeRef.current = () => {
    void finalizeDictation();
  };

  const onMicPointerDown = async (e: ReactPointerEvent) => {
    e.preventDefault();
    if (holdToRecord) {
      holdActiveRef.current = true;
      pendingStopRef.current = false;
      await startDictation();
    }
  };

  const onMicPointerUp = () => {
    if (!holdToRecord) return;
    if (recording) {
      void finalizeDictation();
    } else if (holdActiveRef.current) {
      pendingStopRef.current = true;
      holdActiveRef.current = false;
    }
  };

  const onMicClick = async () => {
    if (holdToRecord) return;
    if (recording || busy) return;
    await startDictation();
  };

  const showMicChrome = !isMobile && (micHover || micOpen);
  const canSend = !disabled && !busy && (draft.trim().length > 0 || files.length > 0);
  const showCaptureUi = recording || busy;

  return (
    <div
      className={cn(
        "px-3 pt-2 sm:px-4",
        /* Mobile: WKWebView already clears the home indicator — extra
           safe-area padding left a ~2–3cm dead zone. Keep a small gap only. */
        isMobile
          ? "pb-2"
          : centered
            ? "pb-0"
            : "pb-5",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
      }}
    >
      <div className={cn("mx-auto w-full", centered ? "max-w-[720px]" : "max-w-3xl")}>
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <span
                key={f.name + f.size}
                className="rounded-full bg-[var(--bg-hover)] px-3 py-1 text-xs text-[var(--fg-muted)]"
              >
                {f.name}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-3 shadow-[0_8px_30px_var(--shadow)]">
          {showCaptureUi ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[var(--fg)]">
                    {busy
                      ? busyLabel
                      : locale === "ru"
                        ? "Голос → текст"
                        : "Speech to text"}
                  </div>
                  {!busy && (
                    <div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">
                      {locale === "ru"
                        ? "Говорите, затем нажмите ✓"
                        : "Speak, then tap ✓"}
                    </div>
                  )}
                </div>
                {!busy && (
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
                    title="Cancel"
                    aria-label={locale === "ru" ? "Отмена" : "Cancel"}
                  >
                    <X size={18} strokeWidth={1.8} />
                  </button>
                )}
                {busy && (
                  <span className="mt-1 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                )}
              </div>

              {!busy && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-100"
                    style={{ width: `${Math.max(6, Math.round(level * 100))}%` }}
                  />
                </div>
              )}

              {!busy && (
                <div className="flex items-end gap-2.5">
                  <div className="min-h-[3.25rem] min-w-0 flex-1 rounded-2xl bg-[var(--bg)] px-3.5 py-3 text-[15px] leading-snug text-[var(--fg)]">
                    {liveHint ||
                      (locale === "ru" ? "Слушаю… говорите" : "Listening… speak")}
                  </div>
                  <button
                    type="button"
                    onClick={() => void finalizeDictation()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-md transition-transform active:scale-95 hover:opacity-90"
                    title={locale === "ru" ? "Вставить текст" : "Insert text"}
                    aria-label={locale === "ru" ? "Готово" : "Done"}
                  >
                    <Check size={22} strokeWidth={2.4} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={taRef}
              value={draft}
              disabled={disabled}
              rows={1}
              placeholder={centered ? t(locale, "placeholderSkills") : t(locale, "placeholder")}
              className="max-h-[160px] min-h-[28px] w-full resize-none bg-transparent px-0.5 text-[15px] leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
              onChange={(e) => {
                setDraft(e.target.value);
                resize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          )}

          {!showCaptureUi && (
            <div
              className={cn(
                "mt-2.5 flex items-center gap-2",
                isMobile ? "min-h-11" : "h-9",
              )}
            >
              {!isMobile && (designMode || chromeAgentActive || webSearch) && (
                <div className="mr-0.5 flex max-w-[40%] items-center gap-1 overflow-hidden">
                  {designMode && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#dbeafe] py-1 pl-2.5 pr-1 text-[11px] font-medium text-[#1d4ed8]">
                      Design
                      <button
                        type="button"
                        onClick={() => setDesignMode(false)}
                        className="rounded-full p-0.5 hover:bg-[#93c5fd]/50"
                        title={locale === "ru" ? "Выключить Design mode" : "Turn off Design mode"}
                        aria-label="Disable Design mode"
                      >
                        <X size={12} strokeWidth={2.2} />
                      </button>
                    </span>
                  )}
                  {chromeAgentActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-2.5 pr-1 text-[11px] font-medium text-[var(--accent)]">
                      Chrome
                      <button
                        type="button"
                        onClick={() => {
                          setChromeAgentActive(false);
                          void setMcpEnabled("chrome", false);
                        }}
                        className="rounded-full p-0.5 hover:bg-black/10"
                        title={locale === "ru" ? "Выключить Chrome agent" : "Turn off Chrome agent"}
                        aria-label="Disable Chrome agent"
                      >
                        <X size={12} strokeWidth={2.2} />
                      </button>
                    </span>
                  )}
                  {webSearch && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-hover)] py-1 pl-2.5 pr-1 text-[11px] font-medium text-[var(--fg-muted)]">
                      <Globe size={11} />
                      <button
                        type="button"
                        onClick={() => setWebSearch(false)}
                        className="rounded-full p-0.5 hover:bg-black/10"
                        title={locale === "ru" ? "Выключить веб-поиск" : "Turn off web search"}
                        aria-label="Disable web search"
                      >
                        <X size={12} strokeWidth={2.2} />
                      </button>
                    </span>
                  )}
                </div>
              )}
              {isMobile && webSearch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-hover)] py-1 pl-2 pr-1 text-[11px] font-medium text-[var(--fg-muted)]">
                  <Globe size={11} />
                  <button
                    type="button"
                    onClick={() => setWebSearch(false)}
                    className="rounded-full p-0.5"
                    aria-label="Disable web search"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              <div className="relative shrink-0">
                <button
                  type="button"
                  className={cn(
                    "flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] shadow-sm transition-colors",
                    "hover:bg-[var(--bg-hover)]",
                    isMobile ? "h-11 w-11" : "h-9 w-9",
                    menuOpen && "bg-[var(--bg-hover)]",
                  )}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="+"
                  aria-expanded={menuOpen}
                >
                  <Plus size={18} strokeWidth={1.7} />
                </button>
                {menuOpen && (
                  <PlusActionMenu fileRef={fileRef} onClose={() => setMenuOpen(false)} />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={fileAccept}
                  className="hidden"
                  onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files || [])])}
                />
              </div>

              <div className="min-w-0 flex-1" aria-hidden />

              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  isMobile ? "min-h-11" : "h-9",
                )}
              >
                <ModelSelector />

                <div
                  className={cn(
                    "relative flex items-center",
                    isMobile ? "min-h-11" : "h-9",
                  )}
                  ref={micMenuRef}
                  onMouseEnter={() => setMicHover(true)}
                  onMouseLeave={() => setMicHover(false)}
                >
                  <div
                    className={cn(
                      "flex items-center rounded-xl transition-colors",
                      isMobile ? "min-h-11" : "h-9",
                      showMicChrome && "bg-[var(--bg-hover)]",
                    )}
                  >
                    {!isMobile && (
                      <button
                        type="button"
                        className={cn(
                          "flex h-9 w-7 items-center justify-center rounded-lg text-[var(--fg-muted)] transition-opacity",
                          showMicChrome
                            ? "opacity-100"
                            : "pointer-events-none w-0 overflow-hidden opacity-0",
                        )}
                        title="Devices"
                        onClick={() => void openDeviceMenu()}
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={cn(
                        "flex items-center justify-center rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                        isMobile ? "h-11 w-11" : "h-9 w-9",
                        micOpen && "bg-[var(--bg-hover)] text-[var(--fg)]",
                        recording && "text-[var(--accent)]",
                      )}
                      title={
                        locale === "ru" ? "Речь в текст" : "Speech to text"
                      }
                      disabled={disabled}
                      onClick={() => void onMicClick()}
                      onPointerDown={(e) => void onMicPointerDown(e)}
                      onPointerUp={onMicPointerUp}
                      onPointerLeave={() => {
                        if (holdToRecord && holdActiveRef.current && recording) {
                          void finalizeDictation();
                        }
                      }}
                    >
                      <Mic size={18} strokeWidth={1.7} />
                    </button>
                  </div>

                  {!isMobile && micOpen && (
                    <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(300px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
                        <Mic size={14} className="text-[var(--fg-muted)]" />
                        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                          <div
                            ref={levelBarRef}
                            className="absolute left-0 top-0 h-full w-0 rounded-full bg-[var(--accent)]"
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {devices.length === 0 && (
                          <div className="px-3 py-3 text-[12.5px] text-[var(--fg-faint)]">
                            {locale === "ru" ? "Нет устройств" : "No devices"}
                          </div>
                        )}
                        {devices.map((d) => {
                          const id = d.deviceId;
                          const label = d.label || `Microphone ${id.slice(0, 6)}`;
                          const active = (deviceId || devices[0]?.deviceId) === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                              onClick={async () => {
                                setDeviceId(id);
                                localStorage.setItem("glow.micDevice", id);
                                await startLevelPreview(id);
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate">{label}</span>
                              {active && <Check size={14} className="text-[var(--accent)]" />}
                            </button>
                          );
                        })}
                      </div>
                      {!isMobile && (
                      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2.5">
                        <span className="flex items-center gap-2 text-[12.5px]">
                          <Hand size={14} /> Hold to record
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={holdToRecord}
                          onClick={() => {
                            const next = !holdToRecord;
                            setHoldToRecord(next);
                            localStorage.setItem("glow.holdToRecord", next ? "1" : "0");
                          }}
                          className={cn(
                            "relative h-[22px] w-[40px] rounded-full",
                            holdToRecord ? "bg-[var(--accent)]" : "bg-[var(--bg-active)]",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow",
                              holdToRecord ? "left-[20px]" : "left-[2px]",
                            )}
                          />
                        </button>
                      </div>
                      )}
                    </div>
                  )}
                </div>

                {canSend && (
                  <button
                    type="button"
                    onClick={() => submit()}
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition-opacity hover:opacity-90",
                      isMobile ? "h-11 w-11" : "h-9 w-9",
                    )}
                    title={locale === "ru" ? "Отправить" : "Send"}
                    aria-label="Send"
                  >
                    <ArrowUp size={16} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
