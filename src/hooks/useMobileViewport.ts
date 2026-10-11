import { useEffect } from "react";

/** Follow the visible viewport when a mobile keyboard overlays the layout viewport. */
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const compact = window.matchMedia("(max-width: 767px)");
    const root = document.documentElement;
    let unfocusedHeight = window.innerHeight;
    const update = () => {
      if (!compact.matches || !viewport) {
        root.style.removeProperty("--glow-viewport-height");
        delete root.dataset.glowKeyboard;
        return;
      }
      root.style.setProperty("--glow-viewport-height", `${viewport.height}px`);
      const editing = document.activeElement?.matches("textarea, input, [contenteditable='true']");
      if (!editing) unfocusedHeight = Math.max(window.innerHeight, viewport.height);
      root.dataset.glowKeyboard = editing && unfocusedHeight - viewport.height > 120 ? "open" : "closed";
    };
    update();
    viewport?.addEventListener("resize", update);
    compact.addEventListener("change", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      compact.removeEventListener("change", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--glow-viewport-height");
      delete root.dataset.glowKeyboard;
    };
  }, []);
}
