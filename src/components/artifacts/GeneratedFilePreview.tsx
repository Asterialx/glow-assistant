import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { WordFilePreview, ExcelFilePreview } from "./OfficeFilePreview";
import type { Artifact } from "../../lib/types";
import { generatedFileFromArtifact, type FileFormat } from "../../lib/generatedFile";
import { documentMarkdown, exportGeneratedFile, downloadBlob, presentationSlides } from "../../lib/fileExport";

export function GeneratedFilePreview({ artifact, locale }: { artifact: Artifact; locale: string }) {
  const file = useMemo(() => generatedFileFromArtifact(artifact), [artifact.content_text, artifact.meta_json]);
  const [index, setIndex] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState(""), [format, setFormat] = useState<FileFormat>(file?.format || "md");
  const ru = locale === "ru";
  useEffect(() => { setIndex(0); setFormat(file?.format || "md"); setError(""); }, [file]);
  useEffect(() => {
    let cancelled = false, url = ""; setPdfUrl(""); setBlob(null);
    if (file) { setBusy(true); exportGeneratedFile(file).then(blob => { if (!cancelled) { setBlob(blob); if (file.format === "pdf") { url = URL.createObjectURL(blob); setPdfUrl(url); } } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); }); }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  if (!file) return <p className="p-4 text-sm text-[var(--fg-muted)]">{ru ? "Не удалось прочитать файл." : "Cannot read file."}</p>;
  const save = async () => {
    setBusy(true); setError("");
    try { const output = format === file.format && blob ? blob : await exportGeneratedFile({ ...file, format }); downloadBlob(output, file.filename.replace(/\.[^.]+$/, `.${format}`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const slides = presentationSlides(file);
  const paperStyle = { "--fg": "#243447", "--fg-muted": "#64748b", "--fg-faint": "#94a3b8", "--accent": "#9e5038", "--bg-elevated": "#f1f5f9", "--bg-input": "#f8fafc", "--border": "#e2e8f0" } as CSSProperties;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] p-3">
      <FileText size={16} className="shrink-0 text-[var(--accent)]" /><span title={file.filename} className="min-w-0 flex-1 truncate text-xs font-medium">{file.filename}</span>
      {["md", "docx", "pdf"].includes(file.format) && <select aria-label={ru ? "Формат скачивания" : "Download format"} value={format} onChange={e => setFormat(e.target.value as FileFormat)} className="rounded-lg bg-[var(--bg-hover)] p-1.5 text-xs"><option value="md">MD</option><option value="docx">Word</option><option value="pdf">PDF</option></select>}
      <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><Download size={13} />{busy ? ru ? "Подготовка…" : "Preparing…" : ru ? "Скачать" : "Download"}</button>
    </div>
    {error && <p role="alert" className="p-3 text-sm text-[var(--fg-muted)]">{error}</p>}
    {file.format === "pdf" ? pdfUrl ? <iframe src={pdfUrl} title={file.filename} className="min-h-0 w-full flex-1 border-0 bg-white" /> : <p className="p-5 text-sm text-[var(--fg-muted)]">{ru ? "Готовлю PDF для просмотра…" : "Preparing PDF preview…"}</p> : file.format === "docx" ? blob ? <WordFilePreview blob={blob} /> : <p className="p-5 text-sm">Открываю документ…</p> : file.format === "xlsx" ? blob ? <ExcelFilePreview blob={blob} ru={ru} /> : <p className="p-5 text-sm">Открываю таблицу…</p> : file.format === "pptx" ? <>
      <div className="flex min-h-0 flex-1 items-center overflow-auto bg-[#e7e8ec] p-4"><section className="relative mx-auto aspect-video w-full shrink-0 overflow-hidden bg-[#F8FAFC] shadow-lg" style={{ containerType: "inline-size", fontFamily: "Arial" }}><div className="absolute inset-y-0 left-0 w-[1.2%] bg-[#C36A4A]" /><h2 className="absolute left-[4.875%] top-[7.33%] m-0 w-[90%] font-bold text-[#243447]" style={{ fontSize: "3.125cqw", lineHeight: 1.2 }}>{slides[index]?.title}</h2><div className="absolute left-[5.25%] top-[26%] w-[89.25%] whitespace-pre-line text-[#334155]" style={{ fontSize: "1.979cqw", lineHeight: 1.74 }}>{slides[index]?.body.replace(/\*\*/g, "") || ""}</div><span className="absolute bottom-[4%] right-[4.75%] text-[#64748B]" style={{ fontSize: "1.042cqw" }}>{index + 1} / {slides.length}</span></section></div>
      <div className="flex items-center justify-center gap-4 border-t border-[var(--border)] p-3"><button aria-label={ru ? "Предыдущий слайд" : "Previous slide"} disabled={!index} onClick={() => setIndex(i => i - 1)} className="disabled:opacity-30"><ChevronLeft size={18} /></button><span className="text-xs text-[var(--fg-muted)]">{index + 1} / {slides.length}</span><button aria-label={ru ? "Следующий слайд" : "Next slide"} disabled={index >= slides.length - 1} onClick={() => setIndex(i => i + 1)} className="disabled:opacity-30"><ChevronRight size={18} /></button></div>
    </> : <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-input)] p-4"><article className="prose-chat mx-auto max-w-3xl rounded-xl bg-white p-7 shadow-sm" style={paperStyle}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />, table: ({ node: _node, ...props }) => <div className="chat-table-scroll"><table {...props} /></div> }}>{documentMarkdown(file)}</ReactMarkdown></article></div>}
  </div>;
}
