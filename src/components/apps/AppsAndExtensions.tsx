import { ArrowLeft, ExternalLink, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { enableChromeAgent, enableGlowDesign } from "../../lib/glowExtensions";

export function AppsAndExtensions() {
  const open = useUiStore((s) => s.appsOpen);
  const setOpen = useUiStore((s) => s.setAppsOpen);
  const locale = useUiStore((s) => s.locale);
  const [chromeBusy, setChromeBusy] = useState(false);
  const [chromeStatus, setChromeStatus] = useState<string | null>(null);

  if (!open) return null;

  const ru = locale === "ru";

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-[var(--bg)]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
        <button
          type="button"
          className="touch-target rounded-xl p-2.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] sm:rounded-lg sm:p-1.5"
          onClick={() => setOpen(false)}
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          className="touch-target rounded-xl p-2.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] sm:rounded-lg sm:p-1.5"
          onClick={() => setOpen(false)}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="truncate text-[15px] font-medium">Apps and extensions</h1>
        <button
          type="button"
          className="touch-target ml-auto rounded-xl p-2.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] sm:rounded-lg sm:p-1.5"
          onClick={() => setOpen(false)}
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <p className="mb-6 text-center font-[family-name:var(--font-display)] text-[1.5rem] text-[var(--fg)]">
          {ru ? "Больше с Glow — там, где ты работаешь" : "Do more with Glow, everywhere you work"}
        </p>

        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
          <Card
            title="Mobile"
            body={
              ru
                ? "Чат с телефона, приложения и задачи на ходу."
                : "Chat hands-free, connect Glow to your favorite apps, and kick off tasks on the go."
            }
            disabled
            disabledLabel={ru ? "Скоро" : "Coming soon"}
          >
            <Row label="iOS" action={ru ? "Скоро" : "Soon"} disabled />
            <Row label="Android" action={ru ? "Скоро" : "Soon"} disabled />
            <div className="mt-4 rounded-xl bg-[var(--bg)] p-3 text-[12px] text-[var(--fg-muted)]">
              {ru
                ? "Мобильное приложение подключим позже — карточка пока неактивна."
                : "Mobile app comes later — this card stays inactive for now."}
            </div>
          </Card>

          <Card
            title="Chrome"
            body={
              ru
                ? "Открывает Chrome, включает агента и новый чат с подтверждением."
                : "Launches Chrome, enables the agent, and opens a chat confirming it’s live."
            }
          >
            <button
              type="button"
              disabled={chromeBusy}
              onClick={() => {
                setChromeBusy(true);
                setChromeStatus(null);
                void enableChromeAgent()
                  .catch((e) => setChromeStatus(e instanceof Error ? e.message : String(e)))
                  .finally(() => setChromeBusy(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {chromeBusy ? "…" : ru ? "Открыть Chrome" : "Open Chrome"}
              <ExternalLink size={13} />
            </button>
            {chromeStatus && (
              <p className="mt-2 text-[12px] text-red-500">{chromeStatus}</p>
            )}
          </Card>

          <Card
            title="Desktop"
            body={
              ru
                ? "Чат, файлы и вкладки в одном приложении Glow."
                : "Chat, cowork, and code in one app. Glow works with your files, apps, and browser tabs."
            }
          >
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
              onClick={() => setOpen(false)}
            >
              {ru ? "Открыть" : "Open"}
            </button>
          </Card>

          <Card
            title="Glow Design"
            badge="Beta"
            body={
              ru
                ? "Включает Design mode и открывает кликабельный прототип:"
                : "Turns on Design mode and opens a clickable prototype:"
            }
          >
            <button
              type="button"
              onClick={() => enableGlowDesign()}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
            >
              {ru ? "Открыть Design" : "Open Design"}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  body,
  badge,
  children,
  disabled,
  disabledLabel,
}: {
  title: string;
  body: string;
  badge?: string;
  children: ReactNode;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  return (
    <div
      className={
        "rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm " +
        (disabled ? "opacity-55" : "")
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-[#dbeafe] px-1.5 py-0.5 text-[10px] font-medium text-[#1d4ed8]">
            {badge}
          </span>
        )}
        {disabled && disabledLabel && (
          <span className="rounded-full bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-faint)]">
            {disabledLabel}
          </span>
        )}
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--fg-muted)]">{body}</p>
      {children}
    </div>
  );
}

function Row({
  label,
  action,
  disabled,
}: {
  label: string;
  action: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2">
      <span className="text-[13.5px]">{label}</span>
      <button
        type="button"
        disabled={disabled}
        className="rounded-xl border border-[var(--border)] px-3 py-1 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {action}
      </button>
    </div>
  );
}
