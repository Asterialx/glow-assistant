import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NotebookPanel } from "./NotebookPanel";
import type { Artifact, ArtifactRevision } from "../../lib/types";
import { Box, Check, Code2, Copy, FileText, Layers, Monitor, Smartphone, X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useModeStore } from "../../stores/modeStore";
import { t } from "../../lib/i18n";
import type { DesignFrame } from "../../lib/designMode";
import { cn } from "../../lib/utils";
import { GenUiArtifact } from "../widgets/GenUiArtifact";
import { HtmlArtifactFrame } from "./HtmlArtifactFrame";
import { GeneratedFilePreview } from "./GeneratedFilePreview";
import { generatedFileFromArtifact } from "../../lib/generatedFile";
const ModelViewer = lazy(() => import("./ModelViewer").then((module) => ({ default: module.ModelViewer })));

interface Props {
  artifacts: Artifact[];
  revisionsByArtifact: Record<string, ArtifactRevision[]>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onSend: (text: string) => void;
  onRestoreRevision: (artifactId: string, revisionId: string) => void;
}

function parseMeta(art: Artifact | undefined): { preview?: DesignFrame; design?: boolean } {
  try {
    return JSON.parse(art?.meta_json || "{}") as { preview?: DesignFrame; design?: boolean };
  } catch {
    return {};
  }
}

function HtmlDesignPreview({
  artifact,
  initialFrame,
  dragging,
}: {
  artifact: Artifact;
  initialFrame: DesignFrame;
  dragging: boolean;
}) {
  const designMode = useModeStore((s) => s.designMode);
  const [frame, setFrame] = useState<DesignFrame>(initialFrame);
  const html = artifact.content_text;

  useEffect(() => {
    setFrame(initialFrame);
  }, [initialFrame, html]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setFrame("desktop")}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]",
            frame === "desktop"
              ? "bg-[var(--bg-active)] text-[var(--fg)]"
              : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]",
          )}
        >
          <Monitor size={12} /> Desktop
        </button>
        <button
          type="button"
          onClick={() => setFrame("phone")}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]",
            frame === "phone"
              ? "bg-[var(--bg-active)] text-[var(--fg)]"
              : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]",
          )}
        >
          <Smartphone size={12} /> Phone
        </button>
      </div>

      {frame === "phone" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[linear-gradient(160deg,#1c1917_0%,#292524_100%)] p-4">
          <div
            className="relative shrink-0 rounded-[2.2rem] border-[3px] border-[#44403c] bg-black p-[10px] shadow-2xl"
            style={{ width: 300, maxWidth: "100%" }}
          >
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div
              className="overflow-hidden rounded-[1.7rem] bg-white"
              style={{ height: "min(520px, 58vh)" }}
            >
              <HtmlArtifactFrame
                artifact={artifact}
                title="phone-preview"
                className="h-full w-full border-0 bg-white"
                dragging={dragging}
              />
            </div>
            <div className="mx-auto mt-2 h-1 w-20 rounded-full bg-[#57534e]" />
          </div>
        </div>
      ) : (
        <HtmlArtifactFrame
          artifact={artifact}
          title="desktop-preview"
          className={cn("min-h-0 flex-1 w-full bg-white", designMode && "border-0")}
          dragging={dragging}
        />
      )}
    </div>
  );
}

function DicomViewer({ text }: { text: string }) {
  const [info, setInfo] = useState("Parsing…");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // content may be "local:name:size" or base64 bytes
        if (text.startsWith("local:")) {
          setInfo(
            `DICOM file attached (${text}). Drop a .dcm with embedded bytes or paste base64 for pixel preview.`,
          );
          return;
        }
        const { DicomMessage, DicomMetaDictionary } = await import("dcmjs");
        const b64 = text.includes(",") ? text.split(",")[1]! : text;
        const raw = Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
        const dicomData = DicomMessage.readFile(raw.buffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
        const rows = Number(dataset.Rows || 0);
        const cols = Number(dataset.Columns || 0);
        const modality = String(dataset.Modality || "?");
        const desc = String(dataset.StudyDescription || dataset.SeriesDescription || "DICOM");
        if (cancelled) return;
        setInfo(`${modality} · ${cols}×${rows} · ${desc}`);

        const canvas = canvasRef.current;
        if (!canvas || !rows || !cols) return;
        const pixel = dataset.PixelData as ArrayBuffer | Uint8Array | ArrayBuffer[] | undefined;
        if (!pixel) return;
        let src: Uint8Array;
        if (pixel instanceof ArrayBuffer) src = new Uint8Array(pixel);
        else if (ArrayBuffer.isView(pixel)) src = new Uint8Array(pixel.buffer);
        else if (Array.isArray(pixel) && pixel[0]) src = new Uint8Array(pixel[0] as ArrayBuffer);
        else return;
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const img = ctx.createImageData(cols, rows);
        const bpp = src.length >= rows * cols * 2 ? 2 : 1;
        let max = 1;
        for (let i = 0; i < rows * cols; i++) {
          const v = bpp === 2 ? src[i * 2]! + (src[i * 2 + 1]! << 8) : src[i]!;
          if (v > max) max = v;
        }
        for (let i = 0; i < rows * cols; i++) {
          const v = bpp === 2 ? src[i * 2]! + (src[i * 2 + 1]! << 8) : src[i]!;
          const g = Math.min(255, Math.floor((v / max) * 255));
          const o = i * 4;
          img.data[o] = g;
          img.data[o + 1] = g;
          img.data[o + 2] = g;
          img.data[o + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      } catch (e) {
        if (!cancelled) {
          setInfo(e instanceof Error ? e.message : "DICOM parse failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div className="flex h-full flex-col items-center gap-3 overflow-auto p-4">
      <Layers className="text-[var(--accent)]" />
      <p className="text-center text-sm text-[var(--fg-muted)]">{info}</p>
      <canvas ref={canvasRef} className="max-h-[70%] max-w-full rounded bg-black shadow-inner" />
    </div>
  );
}

export function ArtifactsPanel({
  artifacts,
  revisionsByArtifact,
  activeId,
  onSelect,
  onSend,
  onRestoreRevision,
}: Props) {
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0];
  const [dragging, setDragging] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const closeArtifacts = useUiStore((s) => s.closeArtifacts);
  const locale = useUiStore((s) => s.locale);
  const width = useUiStore((s) => s.artifactsWidth);
  const setArtifactsWidth = useUiStore((s) => s.setArtifactsWidth);
  const dragStartX = useRef(0);
  const dragStartW = useRef(width);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const delta = dragStartX.current - e.clientX;
      setArtifactsWidth(dragStartW.current + delta);
    };
    const onUp = () => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, setArtifactsWidth]);

  const copyCode = async () => {
    if (!active?.content_text) return;
    try {
      await navigator.clipboard.writeText(active.content_text);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      // Clipboard access is optional in restricted WebViews.
    }
  };

  return (
    <aside
      className="glow-artifacts-panel relative flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)]"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={locale === "ru" ? "Изменить ширину Artifacts" : "Resize Artifacts"}
        aria-valuenow={width}
        aria-valuemin={280}
        aria-valuemax={900}
        onPointerDown={(e) => {
          e.preventDefault();
          dragStartX.current = e.clientX;
          dragStartW.current = width;
          setDragging(true);
        }}
        onDoubleClick={() => setArtifactsWidth(400)}
        className="group absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize md:block"
      >
        <div
          className={
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors " +
            (dragging
              ? "bg-[var(--accent)]"
              : "bg-transparent group-hover:bg-[var(--accent)]/50")
          }
        />
      </div>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Box size={14} className="text-[var(--accent)]" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-medium">{t(locale, "artifacts")}</span>
        <button
          type="button"
          onClick={closeArtifacts}
          className="rounded-lg p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          aria-label={t(locale, "close")}
        >
          <X size={15} />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-2 py-1.5">
        {artifacts.length === 0 && (
          <span className="px-2 py-1 text-xs text-[var(--fg-muted)]">—</span>
        )}
        {artifacts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className={
              (active?.id === a.id ? "bg-[var(--bg-active)] text-[var(--fg)] " : "") +
              "rounded-full px-2.5 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }
          >
            {a.title || a.kind}
          </button>
        ))}
      </div>
      {active && (revisionsByArtifact[active.id]?.length || 0) > 0 && (
        <div className="flex items-center justify-end gap-2 border-b border-[var(--border)] px-3 py-1.5">
          <span className="text-[11px] text-[var(--fg-faint)]">
            {locale === "ru" ? `Текущая · версия ${(revisionsByArtifact[active.id] || []).length + 1}` : `Current · version ${(revisionsByArtifact[active.id] || []).length + 1}`}
          </span>
          <select
            value=""
            aria-label={locale === "ru" ? "История версий артефакта" : "Artifact revision history"}
            onChange={(event) => {
              const revisionId = event.currentTarget.value;
              if (revisionId) onRestoreRevision(active.id, revisionId);
            }}
            className="max-w-44 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] text-[var(--fg-muted)]"
          >
            <option value="">{locale === "ru" ? "Восстановить версию…" : "Restore version…"}</option>
            {(revisionsByArtifact[active.id] || []).map((revision) => (
              <option key={revision.id} value={revision.id}>
                {locale === "ru" ? `Версия ${revision.revision_number} · ${new Date(revision.created_at).toLocaleString("ru-RU")}` : `Version ${revision.revision_number} · ${new Date(revision.created_at).toLocaleString()}`}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {!active && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText className="opacity-40" />
            <p className="text-sm text-[var(--fg-muted)]">
              HTML, code, PDF, images, STL/OBJ, Jupyter & DICOM previews.
            </p>
          </div>
        )}
        {active?.kind === "html" && (
          <HtmlDesignPreview
            artifact={active}
            initialFrame={parseMeta(active).preview === "phone" ? "phone" : "desktop"}
            dragging={dragging}
          />
        )}
        {active?.kind === "genui" && (
          <div className="h-full overflow-auto p-3">
            <GenUiArtifact artifact={active} surface="workspace" onSend={onSend} />
          </div>
        )}
        {active && generatedFileFromArtifact(active) && <GeneratedFilePreview key={active.id} artifact={active} locale={locale} />}
        {active?.kind === "code" && !generatedFileFromArtifact(active) && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
              <Code2 size={14} className="text-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-xs text-[var(--fg-muted)]">
                {active.title || "Code"}
              </span>
              <button
                type="button"
                disabled={!active.content_text}
                onClick={() => void copyCode()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] disabled:opacity-50"
                aria-label={locale === "ru" ? "Скопировать код" : "Copy code"}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? (locale === "ru" ? "Скопировано" : "Copied") : (locale === "ru" ? "Копировать" : "Copy")}
              </button>
            </div>
            {active.content_text ? (
              <pre className="min-h-0 flex-1 overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--fg)]">
                {active.content_text}
              </pre>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--fg-muted)]">
                {locale === "ru" ? "В этом Artifact пока нет кода." : "This Artifact has no code yet."}
              </div>
            )}
          </div>
        )}
        {(active?.kind === "stl" || active?.kind === "obj") && (
          <Suspense fallback={<p className="p-4 text-xs text-[var(--fg-muted)]">…</p>}>
            <ModelViewer source={active.content_text || ""} ext={active.kind} />
          </Suspense>
        )}
        {active?.kind === "dcm" && <DicomViewer text={active.content_text || ""} />}
        {active?.kind === "pdf" && (
          <div className="h-full overflow-auto p-4 text-sm text-[var(--fg-muted)]">
            <div className="mb-2 font-medium text-[var(--fg)]">{active.title || "PDF"}</div>
            <pre className="whitespace-pre-wrap font-[family-name:var(--font-mono)] text-xs">
              {active.content_text?.slice(0, 20000) || "(empty)"}
            </pre>
          </div>
        )}
        {active?.kind === "image" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 overflow-auto p-4">
            <div className="text-sm font-medium text-[var(--fg)]">{active.title || "Image"}</div>
            {active.content_text?.startsWith("data:image") ? (
              <img
                src={active.content_text}
                alt={active.title || "attachment"}
                className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
              />
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">No image data</p>
            )}
          </div>
        )}
        {active?.kind === "jupyter" && <NotebookPanel key={active.id} id={active.id} source={active.content_text || ""} filename={active.title || "notebook"} />}
      </div>
    </aside>
  );
}
