import { FileText, Image, Film, Music, X, Check } from "lucide-react";
import type { ChatAttachment } from "../../lib/attachments";

export function attachmentNames(files: ChatAttachment[]): string[] {
  return [...new Set(files.map(file => file.name.replace(/(\.(?:pdf|docx|xlsx|pptx|mp4|mov|webm)) · .+$/i, "$1")))];
}
export function FileAttachment({ name, size, preview, onRemove }: { name: string; size?: number; preview?: string; onRemove?: () => void }) {
  const ext = name.split(".").pop()?.toUpperCase() || "FILE";
  const Icon = /^(PNG|JPG|JPEG|WEBP|HEIC|GIF)$/.test(ext) ? Image : /^(MP4|MOV|WEBM)$/.test(ext) ? Film : /^(MP3|WAV|M4A|OGG)$/.test(ext) ? Music : FileText;
  if (!onRemove) return <span title={name} className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12px] text-[var(--fg-muted)]"><Icon size={14} strokeWidth={1.6} className="shrink-0" /><span className="max-w-60 truncate">{name}</span></span>;
  return <div className="group flex min-w-0 max-w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 pr-2 shadow-sm">
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">{preview ? <img src={preview} alt="" className="size-full object-cover" /> : <Icon size={21} strokeWidth={1.5} />}</div>
    <div className="min-w-0"><div className="max-w-52 truncate text-[13px] font-medium text-[var(--fg)]" title={name}>{name}</div><div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{ext}{size !== undefined ? ` · ${size < 1000000 ? `${Math.max(1, Math.round(size / 1000))} KB` : `${(size / 1000000).toFixed(1)} MB`}` : ""}</div></div>
    <button type="button" onClick={onRemove} aria-label={`Удалить ${name}`} title={`Удалить ${name}`} className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"><X size={14} /></button>
  </div>;
}
export function DocumentActivity({ phase, locale }: { phase: "reading" | "analysis" | "done"; locale: string }) {
  const ru = locale === "ru";
  return <div role="status" aria-live="polite" className="my-3 flex items-start gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 text-[13px]">
    {phase === "done" ? <Check size={15} className="mt-0.5 text-[var(--fg-faint)]" /> : <FileText size={16} className="mt-0.5 animate-pulse text-[var(--fg-muted)]" />}
    <div><div className="font-medium text-[var(--fg)]">{phase === "reading" ? ru ? "Читаю документ" : "Reading document" : phase === "analysis" ? ru ? "Анализирую содержимое" : "Analyzing content" : ru ? "Документ прочитан" : "Document read"}</div><div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{phase === "reading" ? ru ? "Чтение файла…" : "Reading file…" : phase === "analysis" ? ru ? "Анализ и подготовка ответа…" : "Analysis and response…" : ru ? "Чтение и анализ завершены" : "Reading and analysis complete"}</div></div>
  </div>;
}
