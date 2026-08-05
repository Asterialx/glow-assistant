import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  Link2,
  Laptop,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Smartphone,
} from "lucide-react";
import {
  createPairingCode,
  exportSyncPackage,
  getOrCreateAccount,
  generateSyncKey,
  importSyncPackage,
  linkWithPayload,
  listDevices,
  resolvePairingInput,
  rotateSyncKey,
  saveAccount,
  setDeviceName,
  getDeviceName,
  unlinkDevice,
  type GlowAccount,
  type LinkedDevice,
} from "../../lib/accountSync";
import { useUiStore } from "../../stores/uiStore";
import { t } from "../../lib/i18n";
import { applyTheme, type ThemeId } from "../../lib/themes";
import { cn } from "../../lib/utils";

export function DevicesSection() {
  const locale = useUiStore((s) => s.locale);
  const setUserName = useUiStore((s) => s.setUserName);
  const setLocale = useUiStore((s) => s.setLocale);
  const setThemeId = useUiStore((s) => s.setThemeId);

  const [account, setAccount] = useState<GlowAccount>(() => getOrCreateAccount());
  const [devices, setDevices] = useState<LinkedDevice[]>(() => listDevices());
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairExpires, setPairExpires] = useState<number | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "code" | "pkg" | null>(null);
  const [deviceLabel, setDeviceLabel] = useState(getDeviceName());

  const refresh = () => {
    setAccount(getOrCreateAccount());
    setDevices(listDevices());
  };

  useEffect(() => {
    refresh();
  }, []);

  const expiresLabel = useMemo(() => {
    if (!pairExpires) return "";
    const sec = Math.max(0, Math.floor((pairExpires - Date.now()) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [pairExpires, status, pairCode]);

  const copy = async (text: string, kind: "key" | "code" | "pkg") => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const onGenerate = () => {
    const { code, payload } = createPairingCode();
    setPairCode(code);
    setPairExpires(payload.expiresAt);
    setStatus(
      locale === "ru"
        ? "Код создан. На другом устройстве вставь код или Sync key."
        : "Code created. On the other device paste the code or Sync key.",
    );
  };

  const onJoin = () => {
    const payload = resolvePairingInput(joinInput);
    if (!payload) {
      setStatus(
        locale === "ru"
          ? "Неверный или просроченный код / ключ."
          : "Invalid or expired code / key.",
      );
      return;
    }
    const res = linkWithPayload(payload);
    if (!res.ok) {
      setStatus(res.error);
      return;
    }
    setUserName(payload.displayName);
    setJoinInput("");
    refresh();
    setStatus(
      locale === "ru"
        ? "Устройство связано с аккаунтом."
        : "Device linked to your account.",
    );
  };

  const onExport = async () => {
    const pkg = exportSyncPackage();
    await copy(pkg, "pkg");
    const blob = new Blob([pkg], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "glow-sync.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      locale === "ru"
        ? "Пакет синхронизации сохранён (glow-sync.json)."
        : "Sync package saved (glow-sync.json).",
    );
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const res = importSyncPackage(text);
    if (!res.ok) {
      setStatus(res.error);
      return;
    }
    const acc = getOrCreateAccount();
    setUserName(acc.displayName);
    const theme = localStorage.getItem("glow.theme") as ThemeId | null;
    const loc = localStorage.getItem("glow.locale") as "en" | "ru" | null;
    if (theme) {
      applyTheme(theme);
      setThemeId(theme);
    }
    if (loc) setLocale(loc);
    refresh();
    setStatus(
      locale === "ru" ? "Аккаунт импортирован на это устройство." : "Account imported on this device.",
    );
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">
          {locale === "ru" ? "Устройства" : "Devices"}
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--fg-muted)]">
          {locale === "ru"
            ? "Свяжи Glow на ПК, ноутбуке и других устройствах одним Sync key или одноразовым кодом. Данные профиля и настройки переносятся локально — без обязательного облака."
            : "Link Glow across PCs and laptops with one Sync key or a one-time code. Profile and settings move locally — no cloud required."}
        </p>

        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-1 text-[12px] text-[var(--fg-faint)]">Sync key</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate font-[family-name:var(--font-mono)] text-[13px] tracking-wide text-[var(--fg)]">
              {account.syncKey || (
                <span className="text-[var(--fg-faint)]">
                  {locale === "ru" ? "Не сгенерирован" : "Not generated yet"}
                </span>
              )}
            </code>
            {account.syncKey ? (
              <>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                  onClick={() => copy(account.syncKey, "key")}
                  title="Copy"
                >
                  {copied === "key" ? <Check size={15} /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    setAccount(rotateSyncKey());
                    setStatus(
                      locale === "ru"
                        ? "Sync key обновлён. Старые коды больше не действуют."
                        : "Sync key rotated. Old codes no longer work.",
                    );
                  }}
                  title="Rotate"
                >
                  <RefreshCw size={15} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-[var(--fg)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bg)]"
                onClick={() => {
                  setAccount(generateSyncKey());
                  setStatus(
                    locale === "ru" ? "Sync key создан." : "Sync key generated.",
                  );
                }}
              >
                {locale === "ru" ? "Сгенерировать" : "Generate"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-medium">
              <Link2 size={15} className="text-[var(--accent)]" />
              {locale === "ru" ? "Создать код связи" : "Create link code"}
            </div>
            <p className="mb-3 text-[12.5px] text-[var(--fg-muted)]">
              {locale === "ru"
                ? "Покажи код на другом устройстве (15 мин)."
                : "Show this code on the other device (15 min)."}
            </p>
            {pairCode ? (
              <div className="mb-3 flex items-center gap-2">
                <span className="font-[family-name:var(--font-mono)] text-xl tracking-[0.2em] text-[var(--fg)]">
                  {pairCode}
                </span>
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
                  onClick={() => copy(pairCode, "code")}
                >
                  {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {pairExpires && (
                  <span className="text-[11px] text-[var(--fg-faint)]">{expiresLabel}</span>
                )}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onGenerate}
              className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[13px] font-medium text-[var(--bg)]"
            >
              {locale === "ru" ? "Сгенерировать" : "Generate"}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-medium">
              <Smartphone size={15} className="text-[var(--accent)]" />
              {locale === "ru" ? "Подключить это устройство" : "Link this device"}
            </div>
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder={locale === "ru" ? "Код или Sync key" : "Code or Sync key"}
              className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[13px] outline-none"
            />
            <button
              type="button"
              onClick={onJoin}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
            >
              {locale === "ru" ? "Связать" : "Link"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[14px] font-semibold">
          {locale === "ru" ? "Связанные устройства" : "Linked devices"}
        </h3>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
            placeholder={locale === "ru" ? "Имя этого устройства" : "This device name"}
          />
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]"
            onClick={() => {
              setDeviceName(deviceLabel);
              refresh();
            }}
          >
            {t(locale, "save")}
          </button>
        </div>
        <div className="space-y-1">
          {devices.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5",
                d.isThis && "bg-[var(--bg)]",
              )}
            >
              <Laptop size={16} className="text-[var(--fg-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px]">
                  {d.name}
                  {d.isThis ? (
                    <span className="ml-2 text-[11px] text-[var(--accent)]">
                      {locale === "ru" ? "это устройство" : "this device"}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-[var(--fg-faint)]">
                  {d.platform} · {new Date(d.linkedAt).toLocaleDateString()}
                </div>
              </div>
              {!d.isThis && (
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                  onClick={() => {
                    unlinkDevice(d.id);
                    refresh();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[14px] font-semibold">
          {locale === "ru" ? "Экспорт / импорт" : "Export / import"}
        </h3>
        <p className="mb-3 text-[12.5px] text-[var(--fg-muted)]">
          {locale === "ru"
            ? "Перенеси профиль и настройки файлом glow-sync.json на другое устройство."
            : "Move profile and settings with a glow-sync.json file to another device."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
          >
            <Download size={14} />
            {locale === "ru" ? "Экспорт" : "Export"}
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]">
            <Upload size={14} />
            {locale === "ru" ? "Импорт" : "Import"}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
              }}
            />
          </label>
        </div>
      </section>

      {status && <p className="text-[12.5px] text-[var(--accent)]">{status}</p>}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="mb-1 text-[13.5px] font-medium">
          {locale === "ru" ? "Get apps and extensions" : "Get apps and extensions"}
        </div>
        <p className="mb-3 text-[12.5px] text-[var(--fg-muted)]">
          {locale === "ru"
            ? "Установи Glow Assistant на другое устройство, затем свяжи аккаунт Sync key или импортом."
            : "Install Glow Assistant on another device, then link with Sync key or import."}
        </p>
        <button
          type="button"
          className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[13px] font-medium text-[var(--bg)]"
          onClick={() => {
            const { code } = createPairingCode();
            setPairCode(code);
            setStatus(
              locale === "ru"
                ? "Сначала установи приложение из папки release, затем введи Sync key."
                : "Install from the release folder first, then enter the Sync key.",
            );
          }}
        >
          {locale === "ru" ? "Подготовить связь" : "Prepare linking"}
        </button>
      </section>

      {/* keep account fields writable for parent profile sync */}
      <button
        type="button"
        className="hidden"
        onClick={() => {
          saveAccount(account);
        }}
      />
    </div>
  );
}
