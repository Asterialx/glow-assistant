import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";

/** Plain text of a rendered code node, so the copy button gets the code without markup. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function languageOf(node: ReactNode): string {
  const child = Array.isArray(node) ? node[0] : node;
  const className = child && typeof child === "object" && "props" in child ? String((child as { props: { className?: string } }).props.className ?? "") : "";
  return /language-([\w+#-]+)/.exec(className)?.[1] ?? "";
}

/** A fenced code block with the language as plain text on the left and a text-only copy button on the right. */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const locale = useUiStore((state) => state.locale);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      // Exactly what is on screen: tabs and indentation stay, only the closing newline of the fence and non-breaking spaces go.
      await navigator.clipboard.writeText(textOf(children).replace(/ /g, " ").replace(/\r\n/g, "\n").replace(/\n$/, ""));
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const label = locale === "ru" ? "Копировать" : "Copy";
  return (
    <div className="glow-code">
      <div className="glow-code-bar">
        <span>{languageOf(children) || "text"}</span>
        <button type="button" onClick={() => void copy()} aria-label={copied ? (locale === "ru" ? "Скопировано" : "Copied") : label} className="glow-code-copy">
          <span className="glow-code-copy-label" style={{ opacity: copied ? 0 : 1 }}>{label}</span>
          <Check size={14} strokeWidth={2} className="glow-code-copy-done" style={{ opacity: copied ? 1 : 0 }} />
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
