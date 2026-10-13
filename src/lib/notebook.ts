export interface NotebookCell { type: "code" | "markdown" | "raw"; source: string; output: string }
export interface Notebook { cells: NotebookCell[]; language: string }
export function parseNotebook(source: string): Notebook {
  if (source.length > 500000) throw new Error("Notebook больше 500 000 символов.");
  const value = JSON.parse(source);
  if (value.nbformat !== 4 || !Array.isArray(value.cells) || value.cells.length > 200) throw new Error("Поддерживается ipynb версии 4, до 200 ячеек.");
  const text = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.every(item => typeof item === "string")) return value.join("");
    throw new Error("Некорректный текст ячейки.");
  };
  const cells = value.cells.map((cell: any) => {
    if (!["code", "markdown", "raw"].includes(cell?.cell_type)) throw new Error("Некорректный тип ячейки.");
    const output = (Array.isArray(cell.outputs) ? cell.outputs : []).map((item: any) => {
      if (item.output_type === "stream") return text(item.text || "");
      if (item.output_type === "error") return `${item.ename || "Error"}: ${item.evalue || ""}`;
      // Imported HTML/JS output is never rendered or executed.
      if (item.data?.["text/plain"] != null) return text(item.data["text/plain"]);
      return "";
    }).join("\n");
    return { type: cell.cell_type, source: text(cell.source), output };
  });
  return { cells, language: String(value.metadata?.kernelspec?.language || value.metadata?.language_info?.name || "python").toLowerCase() };
}
export function notebookContext(notebook: Notebook): string {
  return notebook.cells.map((cell, index) => `[${cell.type} cell ${index + 1}]\n${cell.source}${cell.output ? `\n[saved output]\n${cell.output}` : ""}`).join("\n\n");
}
