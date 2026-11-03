import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import { loadModelCatalog } from "../../lib/models";
import { RESTRICTED_MODELS, countModelRequestsToday, isRestrictedModel } from "../../lib/modelLimits";
import { cn } from "../../lib/utils";
import { useAccount } from "../../auth/AccountContext";
import { useChatStore } from "../../stores/chatStore";
import { useModeStore } from "../../stores/modeStore";

export function ModelSelector() {
  const selectedModelId = useChatStore((state) => state.selectedModelId);
  const allModels = useChatStore((state) => state.models);
  const chatStarted = useChatStore((state) => state.messages.length > 0);
  const setSelectedModelId = useChatStore((state) => state.setSelectedModelId);
  const setModels = useChatStore((state) => state.setModels);
  const mode = useModeStore((state) => state.mode);
  const account = useAccount();
  const isAdmin = account?.access.role === "admin";
  const userId = account?.access.user_id;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [used, setUsed] = useState<Record<string, number | null>>({});
  const ref = useRef<HTMLDivElement>(null);
  // Restricted models are offered in Chat only; Work and Code always use the regular ones.
  const models = mode === "home" ? allModels : allModels.filter((model) => !isRestrictedModel(model.id));
  const selected = models.find((model) => model.id === selectedModelId);

  useEffect(() => {
    if (mode === "home" || !isRestrictedModel(selectedModelId)) return;
    const fallback = models[0];
    if (fallback) setSelectedModelId(fallback.id);
  }, [mode, selectedModelId, models.length]);

  useEffect(() => {
    if (!open) {
      setNotice(false);
      return;
    }
    if (!userId || mode !== "home") return;
    for (const id of Object.keys(RESTRICTED_MODELS)) {
      if (!allModels.some((model) => model.id === id)) continue;
      void countModelRequestsToday(userId, id).then((count) => setUsed((prev) => ({ ...prev, [id]: count })));
    }
  }, [open, userId, mode, allModels.length]);

  const refreshModels = async (retries = 0): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setModels(await loadModelCatalog());
    } catch (cause) {
      // Short network blips (DNS, TLS) are common; retry quietly before showing the error.
      if (retries < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (retries + 1)));
        return refreshModels(retries + 1);
      }
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить модели");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshModels();
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label={`Выбрать модель. Сейчас: ${selected?.displayName ?? "Загрузка моделей"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[190px] items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
      >
        {selected && isRestrictedModel(selected.id) && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.7)]" />}
        <span className="truncate font-medium">{selected?.displayName ?? (loading ? "Загрузка моделей…" : "Модели недоступны")}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Доступные модели"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[min(60vh,480px)] w-[min(280px,calc(100vw-48px))] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-2xl"
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[var(--fg-muted)]">
              <LoaderCircle size={14} className="animate-spin" /> Загружаю список моделей…
            </div>
          )}
          {error && (
            <div className="px-3 py-3 text-[12px] text-[var(--fg-muted)]">
              <p>{error}</p>
              <button type="button" onClick={() => void refreshModels()} className="mt-2 inline-flex items-center gap-1.5 text-[var(--fg)]">
                <RefreshCw size={12} /> Повторить
              </button>
            </div>
          )}
          {models.map((model) => {
            const active = model.id === selectedModelId;
            const restriction = RESTRICTED_MODELS[model.id];
            // A restricted model can only start a conversation, so it is greyed out once the chat has messages.
            const locked = !!restriction && chatStarted && !active;
            const count = used[model.id];
            const left = restriction && count != null ? Math.max(restriction.dailyLimit - count, 0) : null;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={locked}
                onClick={() => {
                  if (locked) {
                    setNotice(true);
                    return;
                  }
                  setSelectedModelId(model.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]",
                  active && "bg-[var(--bg-hover)]",
                  locked && "opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--fg)]">
                    {restriction && (
                      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", locked ? "bg-[var(--fg-faint)]" : "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.7)]")} />
                    )}
                    {model.displayName}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--fg-faint)]">
                    {restriction
                      ? "Без цензуры · только новый чат"
                      : model.id.includes("glm") ? "Быстрые ответы и повседневные задачи" : model.id.includes("haiku") ? "Тексты, объяснения и работа с файлами" : "Универсальный помощник"}
                  </span>
                  {restriction && (
                    <span className="mt-1.5 block">
                      {isAdmin ? (
                        <span className="text-[11px] text-[var(--fg-muted)]">Без лимита для администратора</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1" aria-label={left == null ? "Лимит загружается" : `Осталось ${left} из ${restriction.dailyLimit} запросов сегодня`}>
                            {Array.from({ length: restriction.dailyLimit }, (_, index) => (
                              <span
                                key={index}
                                className={cn(
                                  "h-1.5 flex-1 rounded-full",
                                  left != null && index < left ? "bg-orange-500" : "bg-[var(--border)]",
                                )}
                              />
                            ))}
                          </span>
                          <span className="mt-1 block text-[11px] text-[var(--fg-muted)]">
                            {left == null ? `${restriction.dailyLimit} запросов в день` : `Осталось ${left} из ${restriction.dailyLimit} сегодня`}
                            <span className="text-[var(--fg-faint)]"> · сброс в 03:00 МСК</span>
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </span>
                {active && <Check size={15} className="shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
          {notice && (
            <div role="status" className="m-1 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 text-[12px] leading-snug text-[var(--fg)]">
              Эта модель работает только в новом чате. Создайте новый чат, чтобы выбрать её.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
