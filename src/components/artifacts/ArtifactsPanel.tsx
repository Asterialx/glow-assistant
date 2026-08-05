import { useEffect, useRef, useState } from "react";
import type { Artifact } from "../../lib/types";
import { Box, Code2, ExternalLink, FileText, Layers, Monitor, Smartphone, X } from "lucide-react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useUiStore } from "../../stores/uiStore";
import { useModeStore } from "../../stores/modeStore";
import { t } from "../../lib/i18n";
import type { DesignFrame } from "../../lib/designMode";
import { openHtmlPreview } from "../../lib/tauri";
import { cn } from "../../lib/utils";

interface Props {
  artifacts: Artifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** When true (phone), panel fills the chat area and hides the resize handle. */
  fullScreen?: boolean;
}

function parseMeta(art: Artifact | undefined): { preview?: DesignFrame; design?: boolean } {
  try {
    return JSON.parse(art?.meta_json || "{}") as { preview?: DesignFrame; design?: boolean };
  } catch {
    return {};
  }
}

function HtmlDesignPreview({
  html,
  initialFrame,
  dragging,
}: {
  html: string;
  initialFrame: DesignFrame;
  dragging: boolean;
}) {
  const locale = useUiStore((s) => s.locale);
  const designMode = useModeStore((s) => s.designMode);
  const [frame, setFrame] = useState<DesignFrame>(initialFrame);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setFrame(initialFrame);
  }, [initialFrame, html]);

  const openBrowser = async () => {
    setOpening(true);
    try {
      await openHtmlPreview(html);
    } finally {
      setOpening(false);
    }
  };

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
        <button
          type="button"
          disabled={opening}
          onClick={() => void openBrowser()}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] disabled:opacity-50"
        >
          <ExternalLink size={12} />
          {opening ? "…" : locale === "ru" ? "В браузере" : "Open browser"}
        </button>
      </div>

      {frame === "phone" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[linear-gradient(160deg,#1c1917_0%,#292524_100%)] p-4">
          <div
            className="relative shrink-0 rounded-[2.2rem] border-[3px] border-[#44403c] bg-black p-[10px] shadow-2xl"
            style={{ width: 320 }}
          >
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div className="overflow-hidden rounded-[1.7rem] bg-white" style={{ height: 640 }}>
              <iframe
                title="phone-preview"
                sandbox="allow-scripts"
                className="h-full w-full border-0 bg-white"
                style={dragging ? { pointerEvents: "none" } : undefined}
                srcDoc={html || "<p>Empty</p>"}
              />
            </div>
            <div className="mx-auto mt-2 h-1 w-20 rounded-full bg-[#57534e]" />
          </div>
        </div>
      ) : (
        <iframe
          title="desktop-preview"
          sandbox="allow-scripts"
          className={cn("min-h-0 flex-1 w-full bg-white", designMode && "border-0")}
          style={dragging ? { pointerEvents: "none" } : undefined}
          srcDoc={html || "<p>Empty</p>"}
        />
      )}
    </div>
  );
}

function ModelViewer({ source, ext }: { source: string; ext: "stl" | "obj" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !source.trim()) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let mesh: THREE.Object3D | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f5f2);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(el.clientHeight, 1), 0.1, 5000);
    camera.position.set(2, 2, 3);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(3, 5, 2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xfff5eb, 0.7));

    const fit = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 2 / maxDim;
      obj.scale.setScalar(scale);
      camera.position.set(2.2, 1.8, 2.8);
      camera.lookAt(0, 0, 0);
    };

    const mat = new THREE.MeshStandardMaterial({
      color: 0xc96442,
      metalness: 0.12,
      roughness: 0.45,
    });

    try {
      if (ext === "stl") {
        // Binary STL from base64, or ASCII text
        let buffer: ArrayBuffer;
        if (source.startsWith("data:") || /^[A-Za-z0-9+/=\s]+$/.test(source.slice(0, 200)) && source.length > 200 && !source.includes("solid")) {
          const b64 = source.includes(",") ? source.split(",")[1]! : source;
          const bin = atob(b64.replace(/\s/g, ""));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          buffer = bytes.buffer;
        } else {
          buffer = new TextEncoder().encode(source).buffer;
        }
        const geo = new STLLoader().parse(buffer);
        geo.computeVertexNormals();
        mesh = new THREE.Mesh(geo, mat);
        fit(mesh);
        scene.add(mesh);
      } else {
        const obj = new OBJLoader().parse(source);
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = mat;
          }
        });
        mesh = obj;
        fit(obj);
        scene.add(obj);
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to parse 3D model");
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh = fallback;
      scene.add(fallback);
    }

    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (mesh) {
        mesh.rotation.y += 0.008;
        mesh.rotation.x += 0.002;
      }
      renderer?.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
      mat.dispose();
      el.innerHTML = "";
    };
  }, [source, ext]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      {err && (
        <div className="absolute bottom-2 left-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
          {err}
        </div>
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

let pyodidePromise: Promise<unknown> | null = null;

async function getPyodide(): Promise<{
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (opts: { batched: (s: string) => void }) => void;
}> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      document.head.appendChild(s);
      await new Promise<void>((resolve, reject) => {
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Pyodide"));
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadPyodide = (window as any).loadPyodide as (opts: { indexURL: string }) => Promise<any>;
      return loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
    })();
  }
  return pyodidePromise as Promise<{
    runPythonAsync: (code: string) => Promise<unknown>;
    setStdout: (opts: { batched: (s: string) => void }) => void;
  }>;
}

export function ArtifactsPanel({ artifacts, activeId, onSelect, fullScreen }: Props) {
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0];
  const [jupyterCode, setJupyterCode] = useState(
    active?.kind === "jupyter" && active.content_text
      ? active.content_text
      : "print('Glow Jupyter')\nprint(2 + 2)\n",
  );
  const [jupyterOut, setJupyterOut] = useState("");
  const [jupyterBusy, setJupyterBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const closeArtifacts = useUiStore((s) => s.closeArtifacts);
  const locale = useUiStore((s) => s.locale);
  const width = useUiStore((s) => s.artifactsWidth);
  const setArtifactsWidth = useUiStore((s) => s.setArtifactsWidth);
  const dragStartX = useRef(0);
  const dragStartW = useRef(width);

  useEffect(() => {
    if (active?.kind === "jupyter" && active.content_text) {
      setJupyterCode(active.content_text);
    }
  }, [active?.id, active?.kind, active?.content_text]);

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

  const runPython = async () => {
    setJupyterBusy(true);
    setJupyterOut(locale === "ru" ? "Загрузка Pyodide…" : "Loading Pyodide…");
    try {
      const py = await getPyodide();
      let captured = "";
      py.setStdout({
        batched: (s: string) => {
          captured += s + "\n";
        },
      });
      const result = await py.runPythonAsync(jupyterCode);
      const extra = result != null ? String(result) : "";
      setJupyterOut((captured + (extra ? `\n=> ${extra}` : "")).trim() || "(ok)");
    } catch (e) {
      setJupyterOut(e instanceof Error ? e.message : String(e));
    } finally {
      setJupyterBusy(false);
    }
  };

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)]",
        fullScreen && "w-full border-l-0",
      )}
      style={fullScreen ? undefined : { width }}
    >
      {!fullScreen && (
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
        className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize"
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
      )}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-4">
        <Box size={14} className="text-[var(--accent)]" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-medium">{t(locale, "artifacts")}</span>
        <button
          type="button"
          onClick={closeArtifacts}
          className="touch-target flex h-11 w-11 items-center justify-center rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] sm:h-auto sm:w-auto sm:rounded-lg sm:p-1"
          aria-label={t(locale, "close")}
        >
          <X size={fullScreen ? 20 : 15} />
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
              "rounded-full px-3 py-2 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] sm:px-2.5 sm:py-1"
            }
          >
            {a.title || a.kind}
          </button>
        ))}
      </div>
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
            html={active.content_text || "<p>Empty</p>"}
            initialFrame={parseMeta(active).preview === "phone" ? "phone" : "desktop"}
            dragging={dragging}
          />
        )}
        {active?.kind === "code" && (
          <pre className="h-full overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
            <Code2 className="mb-2 inline" size={14} /> {active.title}
            {"\n\n"}
            {active.content_text}
          </pre>
        )}
        {(active?.kind === "stl" || active?.kind === "obj") && (
          <ModelViewer source={active.content_text || ""} ext={active.kind} />
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
        {active?.kind === "jupyter" && (
          <div className="flex h-full flex-col p-3">
            <textarea
              className="min-h-[140px] flex-1 rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-[family-name:var(--font-mono)] text-xs"
              value={jupyterCode}
              onChange={(e) => setJupyterCode(e.target.value)}
            />
            <button
              type="button"
              disabled={jupyterBusy}
              className="mt-2 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
              onClick={() => void runPython()}
            >
              {jupyterBusy ? "Running…" : "Run cell (Pyodide)"}
            </button>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-[var(--bg)] p-2 text-xs">{jupyterOut}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}
