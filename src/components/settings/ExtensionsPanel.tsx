import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Search,
  Settings2,
  Store,
  Trash2,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  EXTENSION_CATALOG,
  type ExtensionCategory,
  type ExtensionId,
  getExtension,
} from "../../lib/extensions/catalog";
import { useExtensionsStore } from "../../lib/extensions/registry";
import { runExtensionAction } from "../../lib/extensions/actions";
import { useUiStore } from "../../stores/uiStore";
import { cn } from "../../lib/utils";

type View = "list" | "store" | "detail";

interface Props {
  onOpenAgents?: () => void;
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors",
        on ? "bg-[var(--accent)]" : "bg-[var(--bg-active)]",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform",
          on ? "left-[20px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

export function ExtensionsPanel({ onOpenAgents }: Props) {
  const locale = useUiStore((s) => s.locale);
  const ru = locale === "ru";
  const installed = useExtensionsStore((s) => s.installed);
  const install = useExtensionsStore((s) => s.install);
  const uninstall = useExtensionsStore((s) => s.uninstall);
  const setEnabled = useExtensionsStore((s) => s.setEnabled);
  const setConfig = useExtensionsStore((s) => s.setConfig);
  const isInstalled = useExtensionsStore((s) => s.isInstalled);

  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExtensionCategory | "all">("all");
  const [detailId, setDetailId] = useState<ExtensionId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string | null>(null);

  const installedDefs = useMemo(
    () =>
      installed
        .map((i) => ({ item: i, def: getExtension(i.id) }))
        .filter((x): x is { item: (typeof installed)[0]; def: NonNullable<ReturnType<typeof getExtension>> } =>
          Boolean(x.def),
        ),
    [installed],
  );

  const storeList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXTENSION_CATALOG.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.descriptionRu.toLowerCase().includes(q) ||
        e.id.includes(q)
      );
    });
  }, [query, category]);

  const detail = detailId ? getExtension(detailId) : null;
  const detailInstalled = detailId ? installed.find((x) => x.id === detailId) : null;

  const runTest = async (id: ExtensionId, action: "test" | "open" | "screenshot" | "focus" = "test") => {
    setBusy(id);
    setActionLog(null);
    try {
      const msg = await runExtensionAction(id, action);
      setActionLog(msg);
    } catch (e) {
      setActionLog(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (view === "store") {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
            onClick={() => setView("list")}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-[18px] font-semibold">Extension store</h2>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              {ru
                ? "Выбери расширение → Connect — оно появится в списке."
                : "Pick an extension → Connect — it appears in your list."}
            </p>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-faint)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ru ? "Поиск…" : "Search…"}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-8 pr-3 text-[13px] outline-none"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </Chip>
          {(Object.keys(CATEGORY_LABELS) as ExtensionCategory[]).map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>

        <div className="space-y-2">
          {storeList.map((e) => {
            const Icon = e.icon;
            const on = isInstalled(e.id);
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">{e.name}</span>
                    <span className="text-[11px] text-[var(--fg-faint)]">
                      {CATEGORY_LABELS[e.category]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--fg-muted)]">
                    {ru ? e.descriptionRu : e.description}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(e.id);
                    try {
                      await install(e.id);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={cn(
                    "shrink-0 rounded-xl px-3 py-1.5 text-[12.5px] font-medium",
                    on
                      ? "border border-[var(--border)] text-[var(--fg-muted)]"
                      : "bg-[var(--accent)] text-white",
                  )}
                >
                  {on ? (
                    <span className="inline-flex items-center gap-1">
                      <Check size={13} /> Installed
                    </span>
                  ) : busy === e.id ? (
                    "…"
                  ) : (
                    "Connect"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "detail" && detail && detailInstalled) {
    const Icon = detail.icon;
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
            onClick={() => {
              setView("list");
              setDetailId(null);
              setActionLog(null);
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{detail.name}</h2>
            <p className="text-[12px] text-[var(--fg-muted)]">
              {ru ? detail.descriptionRu : detail.description}
            </p>
          </div>
          <Toggle
            on={detailInstalled.enabled}
            onChange={(v) => void setEnabled(detail.id, v)}
          />
        </div>

        {(detail.configKeys || []).map((c) => (
          <label key={c.key} className="mb-3 block">
            <span className="mb-1 block text-[12px] text-[var(--fg-muted)]">{c.label}</span>
            <input
              value={detailInstalled.config[c.key] || ""}
              placeholder={c.placeholder}
              onChange={(e) => setConfig(detail.id, c.key, e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[12.5px] outline-none"
            />
          </label>
        ))}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || !detailInstalled.enabled}
            onClick={() =>
              void runTest(
                detail.id,
                detail.id === "screenshot"
                  ? "screenshot"
                  : detail.id === "windows"
                    ? "focus"
                    : detail.id === "word" ||
                        detail.id === "excel" ||
                        detail.id === "powerpoint" ||
                        detail.id === "chrome"
                      ? "open"
                      : "test",
              )
            }
            className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[12.5px] font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {busy === detail.id ? "…" : ru ? "Проверить" : "Test / Open"}
          </button>
          {(detail.mcpId || detail.id === "mcp-hub") && onOpenAgents && (
            <button
              type="button"
              onClick={onOpenAgents}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px]"
            >
              Agents & MCP
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await uninstall(detail.id);
              setView("list");
              setDetailId(null);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] text-[var(--danger)]"
          >
            <Trash2 size={13} />
            Remove
          </button>
        </div>

        {actionLog && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-[11.5px] leading-relaxed text-[var(--fg-muted)] whitespace-pre-wrap">
            {actionLog}
          </pre>
        )}
      </div>
    );
  }

  // Installed list
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold">Extensions</h2>
          <p className="mt-1 max-w-md text-[13px] text-[var(--fg-muted)]">
            {ru
              ? "Разрешить Glow работать с приложениями и данными на этом компьютере."
              : "Allow Glow to directly interact with apps, data, and tools on your computer."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView("store")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
        >
          <Store size={14} />
          Browse extensions
        </button>
      </div>

      {installedDefs.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg)] text-[var(--fg-faint)]">
            <Store size={22} />
          </div>
          <p className="text-[14px] text-[var(--fg-muted)]">
            {ru ? "Extensions пока не установлены" : "No extensions installed"}
          </p>
          <button
            type="button"
            onClick={() => setView("store")}
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white"
          >
            Browse extensions
          </button>
          {onOpenAgents && (
            <button
              type="button"
              onClick={onOpenAgents}
              className="mt-2 rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px]"
            >
              Advanced settings
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {installedDefs.map(({ item, def }) => {
            const Icon = def.icon;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-2.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon size={16} />
                </div>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setDetailId(item.id);
                    setView("detail");
                    setActionLog(null);
                  }}
                >
                  <div className="text-[13.5px] font-medium">{def.name}</div>
                  <div className="text-[11.5px] text-[var(--fg-faint)]">
                    {item.enabled ? "On" : "Off"} · {CATEGORY_LABELS[def.category]}
                  </div>
                </button>
                <Toggle on={item.enabled} onChange={(v) => void setEnabled(item.id, v)} />
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
                  title="Configure"
                  onClick={() => {
                    setDetailId(item.id);
                    setView("detail");
                  }}
                >
                  <Settings2 size={15} />
                </button>
                <ChevronRight size={14} className="text-[var(--fg-faint)]" />
              </div>
            );
          })}
          {onOpenAgents && (
            <button
              type="button"
              onClick={onOpenAgents}
              className="mt-3 text-[12.5px] text-[#5b8def] hover:underline"
            >
              Advanced settings → Agents & MCP
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11.5px]",
        active
          ? "bg-[var(--fg)] text-[var(--bg)]"
          : "bg-[var(--bg)] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]",
      )}
    >
      {children}
    </button>
  );
}
