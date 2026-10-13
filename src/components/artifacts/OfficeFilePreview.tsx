import { useEffect, useRef, useState, type CSSProperties } from "react";

export function WordFilePreview({ blob }: { blob: Blob }) {
  const host = useRef<HTMLDivElement>(null), page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1), [error, setError] = useState("");
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, Math.max(.2, (container.clientWidth - 32) / 794))));
    observer.observe(container); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const target = document.createElement("div");
    setError("");
    void import("docx-preview").then(({ renderAsync }) => renderAsync(blob, target, undefined, {
      className: "glow-word", inWrapper: false, ignoreWidth: false, ignoreHeight: false,
      ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      renderAltChunks: false, useBase64URL: true,
    })).then(() => { if (!cancelled && page.current) page.current.replaceChildren(target); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [blob]);
  return <div ref={host} className="min-h-0 flex-1 overflow-auto bg-[#e7e8ec] p-4">
    {error && <p role="alert" className="text-sm text-[#334155]">{error}</p>}
    <div ref={page} className="glow-word-pages mx-auto w-fit text-[#243447]" style={{ zoom: scale } as CSSProperties} />
    <style>{`.glow-word-pages section.glow-word {background:white;box-shadow:0 2px 12px #0002;margin:0 auto 24px;box-sizing:border-box}.glow-word-pages p{max-width:none}`}</style>
  </div>;
}

type SheetView = { name: string; widths: number[]; rows: { height: number; cells: { text: string; formula?: string; style: CSSProperties }[] }[]; total: number };
const letter = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : letter(Math.floor(index / 26) - 1) + String.fromCharCode(65 + index % 26);
export function ExcelFilePreview({ blob, ru }: { blob: Blob; ru: boolean }) {
  const [sheets, setSheets] = useState<SheetView[]>([]), [index, setIndex] = useState(0), [selected, setSelected] = useState([0, 0]), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false; setSheets([]); setIndex(0); setSelected([0, 0]); setError("");
    void (async () => {
      const module = await import("exceljs"), Excel = module.default || module;
      const workbook = new Excel.Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
      const views = workbook.worksheets.map(sheet => ({ name: sheet.name, total: sheet.rowCount,
        widths: Array.from({ length: sheet.columnCount }, (_, c) => (sheet.getColumn(c + 1).width || 14) * 7 + 5),
        rows: Array.from({ length: Math.min(sheet.rowCount, 200) }, (_, r) => ({ height: (sheet.getRow(r + 1).height || 15) * 4 / 3,
          cells: Array.from({ length: sheet.columnCount }, (_, c) => {
            const cell = sheet.getCell(r + 1, c + 1), value = cell.value;
            const formula = value && typeof value === "object" && "formula" in value ? value.formula : undefined;
            const result = formula ? cell.result : value;
            let text = result == null ? "" : typeof result === "object" && "error" in result ? String(result.error) : String(result);
            if (typeof result === "number" && cell.numFmt === "#,##0.00") text = result.toLocaleString(ru ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const fill = cell.fill?.type === "pattern" ? cell.fill.fgColor?.argb : undefined;
            return { text, formula, style: { background: fill ? `#${fill.slice(-6)}` : "#fff", color: cell.font?.color?.argb ? `#${cell.font.color.argb.slice(-6)}` : "#111827", fontFamily: cell.font?.name || "Arial", fontSize: (cell.font?.size || 11) * 4 / 3, fontWeight: cell.font?.bold ? 700 : 400, fontStyle: cell.font?.italic ? "italic" : "normal", textAlign: cell.alignment?.horizontal || (typeof result === "number" ? "right" : "left"), whiteSpace: cell.alignment?.wrapText ? "pre-wrap" : "nowrap" } as CSSProperties };
          }) })) }));
      if (!cancelled) setSheets(views);
    })().catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [blob, ru]);
  const sheet = sheets[index], cell = sheet?.rows[selected[0]]?.cells[selected[1]];
  return <div className="flex min-h-0 flex-1 flex-col bg-white text-[#111827]">
    {error && <p role="alert" className="p-4 text-sm">{error}</p>}
    <div className="flex shrink-0 items-center gap-3 border-b border-[#d5dbe1] bg-[#f8fafc] px-3 py-2 text-xs"><span className="w-10 font-medium">{letter(selected[1])}{selected[0] + 1}</span><span className="italic text-[#64748b]">fx</span><span className="truncate">{cell?.formula ? `=${cell.formula}` : cell?.text}</span></div>
    <div className="min-h-0 flex-1 overflow-auto"><table className="border-collapse" style={{ tableLayout: "fixed" }}><colgroup><col style={{ width: 38 }} />{sheet?.widths.map((width, c) => <col key={c} style={{ width }} />)}</colgroup><thead><tr><th className="sticky top-0 border border-[#d5dbe1] bg-[#eef1f4]" />{sheet?.widths.map((_, c) => <th key={c} className="sticky top-0 border border-[#d5dbe1] bg-[#eef1f4] py-1 text-xs font-normal">{letter(c)}</th>)}</tr></thead><tbody>{sheet?.rows.map((row, r) => <tr key={r} style={{ height: row.height }}><th className="border border-[#d5dbe1] bg-[#eef1f4] px-2 text-xs font-normal text-[#64748b]">{r + 1}</th>{row.cells.map((cell, c) => <td key={c} onClick={() => setSelected([r, c])} style={{ ...cell.style, minWidth: sheet.widths[c], maxWidth: sheet.widths[c], outline: selected[0] === r && selected[1] === c ? "2px solid #217346" : undefined, outlineOffset: -2 }} className="cursor-cell border border-[#e0e4e8] px-2 py-1">{cell.text}</td>)}</tr>)}</tbody></table></div>
    {sheet && sheet.total > 200 && <p className="px-3 py-1 text-xs text-[#64748b]">{ru ? "Показаны первые 200 строк; в файле — весь лист." : "First 200 rows shown; file contains all rows."}</p>}
    <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-[#d5dbe1] bg-[#f1f3f5] px-3">{sheets.map((sheet, i) => <button key={sheet.name} onClick={() => { setIndex(i); setSelected([0, 0]); }} className={`shrink-0 border-b-2 px-4 py-2 text-xs ${index === i ? "border-[#217346] bg-white font-semibold text-[#217346]" : "border-transparent text-[#64748b]"}`}>{sheet.name}</button>)}</div>
  </div>;
}
