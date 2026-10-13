import { useEffect, useMemo, useState } from "react";
import { parseNotebook, type NotebookCell } from "../../lib/notebook";
import { runPythonCell, stopPython } from "../../lib/pythonRuntime";

export function NotebookPanel({ id, source, filename }: { id: string; source: string; filename: string }) {
  const imported = useMemo(() => {
    try { return filename.toLowerCase().endsWith(".ipynb") || (source.trim().startsWith("{") && /"nbformat"\s*:/.test(source)) ? parseNotebook(source) : { cells: [{ type: "code" as const, source, output: "" }], language: "python" }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [source, filename]);
  const [cells, setCells] = useState<NotebookCell[]>("cells" in imported ? imported.cells! : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setCells("cells" in imported ? imported.cells! : []); setError(""); }, [imported]);
  const runnable = "language" in imported && ["python", "python3"].includes(imported.language!);
  if ("error" in imported) return <p role="alert" className="p-4 text-sm">{imported.error}</p>;
  const run = async (indices: number[]) => {
    setBusy(true); setError("");
    try {
      for (const index of indices) {
        const output = await runPythonCell(id, cells[index].source);
        setCells(current => current.map((cell, i) => i === index ? { ...cell, output } : cell));
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const download = () => {
    const notebook = { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } }, cells: cells.map((cell, index) => ({ id: `cell-${index}`, cell_type: cell.type, metadata: {}, source: cell.source, ...(cell.type === "code" ? { execution_count: null, outputs: cell.output ? [{ output_type: "stream", name: "stdout", text: cell.output }] : [] } : {}) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(notebook, null, 2)], { type: "application/x-ipynb+json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename.endsWith(".ipynb") ? filename : "notebook.ipynb"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="h-full overflow-y-auto p-3">
    <div className="mb-3 flex flex-wrap gap-2"><button disabled={busy || !runnable} onClick={() => void run(cells.flatMap((cell, i) => cell.type === "code" ? [i] : []))} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Выполняется…" : "Запустить все ячейки"}</button>{busy && <button onClick={stopPython} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">Остановить Python</button>}<button onClick={download} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">Скачать .ipynb</button></div>
    <p className="mb-3 text-xs text-[var(--fg-muted)]">Код выполняется в браузере только по нажатию. Изменения можно сохранить скачиванием. {runnable ? "Python / Pyodide; не все библиотеки Jupyter поддерживаются." : "Этот язык доступен только для просмотра."}</p>
    {cells.map((cell, index) => <div key={index} className="mb-3 rounded-xl border border-[var(--border)] p-3"><p className="mb-2 text-xs text-[var(--fg-muted)]">{cell.type} · {index + 1}</p>{cell.type === "code" ? <><textarea aria-label={`Код ячейки ${index + 1}`} className="min-h-24 w-full rounded bg-[var(--bg)] p-2 font-mono text-xs" value={cell.source} onChange={e => setCells(current => current.map((value, i) => i === index ? { ...value, source: e.target.value } : value))} /><button disabled={busy || !runnable} onClick={() => void run([index])} className="mt-2 text-xs text-[var(--accent)] disabled:opacity-50">Запустить ячейку</button>{cell.output && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{cell.output}</pre>}</> : <pre className="whitespace-pre-wrap text-sm">{cell.source}</pre>}</div>)}
    {error && <pre role="alert" className="whitespace-pre-wrap text-xs text-[var(--danger)]">{error}</pre>}
  </section>;
}
