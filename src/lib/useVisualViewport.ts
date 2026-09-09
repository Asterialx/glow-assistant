import { useEffect } from "react";

/**
 * Pin #root to the visible viewport so mobile keyboards shrink the app
 * instead of covering the input bar and sheets.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const root = document.documentElement;
    const app = document.getElementById("root");
    const vv = window.visualViewport;

    const sync = () => {
      const height = Math.round(vv?.height ?? window.innerHeight);
      const offsetTop = Math.round(vv?.offsetTop ?? 0);
      const offsetLeft = Math.round(vv?.offsetLeft ?? 0);

      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--vv-offset-top", `${offsetTop}px`);
      root.style.setProperty("--vv-offset-left", `${offsetLeft}px`);
      // When keyboard is open, drop home-indicator padding on the input bar.
      const keyboardOpen =
        typeof window !== "undefined" &&
        Math.round(window.innerHeight) - height - offsetTop > 80;
      root.style.setProperty("--kb-safe", keyboardOpen ? "0" : "1");
      root.dataset.keyboard = keyboardOpen ? "open" : "closed";

      if (!app) return;
      app.style.position = "fixed";
      app.style.top = `${offsetTop}px`;
      app.style.left = `${offsetLeft}px`;
      app.style.right = "auto";
      app.style.bottom = "auto";
      app.style.width = `${Math.round(vv?.width ?? window.innerWidth)}px`;
      app.style.height = `${height}px`;
      app.style.transform = "";
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--vv-offset-top");
      root.style.removeProperty("--vv-offset-left");
      if (app) {
        app.style.position = "";
        app.style.top = "";
        app.style.left = "";
        app.style.right = "";
        app.style.bottom = "";
        app.style.width = "";
        app.style.height = "";
        app.style.transform = "";
      }
    };
  }, []);
}
